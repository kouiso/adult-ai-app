/**
 * 3シナリオ並行ブラウザテスト
 * 既存Chrome(CDP port 9222)に接続し、3タブで同時実行
 *
 * 使い方: node script/e2e-scenario-test.cjs
 */
const { chromium } = require("playwright");

const BASE_URL = "http://localhost:8788";
const CDP_ENDPOINT = "http://localhost:9222";
// AI応答の最大待ち時間（120秒）
const RESPONSE_TIMEOUT_MS = 120_000;
// ターン間のクールダウン（APIレートリミット対策）
const TURN_COOLDOWN_MS = 3_000;

interface Scenario {
  name: string;
  char: string;
  firstPerson: string;
  messages: string[];
}

const SCENARIOS: Record<string, Scenario> = {
  A: {
    name: "Scenario A: 鳴海つかさ",
    char: "鳴海つかさ",
    firstPerson: "あたし",
    messages: [
      "つかさ、まだ残ってたの？今日のプレゼン資料すごくよかったよ。報告書手伝うよ",
      "二人で飲みに行かない？つかさってさ、今の顔すごくかわいい",
      "つかさの顎を持ち上げてキスする …ずっとこうしたかった",
      "つかさのブラウスのボタンを外しながら首筋にキスする つかさ…もっと触りたい",
      "つかさ…入れるよ。ゆっくりいくから",
      "深く腰を動かしながら つかさの中、すごい…きつくて熱い",
      "もう限界…つかさの中に出していい？",
      "つかさの奥に全部出す …つかさ…好きだ。ずっと好きだった",
    ],
  },
  B: {
    name: "Scenario B: 月島みつき",
    char: "月島みつき",
    firstPerson: "あたし",
    messages: [
      "遅くまでやってるんだね。ウィスキー、ロックで。みつきさんはいつからバーテンダーやってるの？",
      "…綺麗な手だな。カクテル作る手つきがすごく好き。もう閉店？最後の一杯、一緒にどう？",
      "カウンター越しにみつきの手に触れる …冷たいな、この手。温めてあげたい",
      "みつきの首筋にそっと唇を寄せる …ここ、弱いんでしょ？",
      "みつきのベストを脱がせながら深くキスする みつき…奥の部屋、行こう",
      "みつき…入れるよ。ゆっくりみつきの中に入っていく",
      "みつきを抱き上げながら激しく腰を動かす みつき…中に出したい…いい？",
      "みつきの中に深く出す …みつき…最高だ。今夜は帰さないよ",
    ],
  },
  C: {
    name: "Scenario C: 九条あずさ",
    char: "九条あずさ",
    firstPerson: "私",
    messages: [
      "先生、今日の検査ちょっと緊張するんですけど…いつもこんなに近いんですか？",
      "先生の手、冷たくて気持ちいい…。あずさの白衣の袖を掴む もっと診てほしいです",
      "あずさの白衣を脱がせる …先生、白衣の下すごいね。もう先生じゃなくてあずさって呼んでいい？",
      "あずさを診察台に押し倒す 今度は俺が先生を検査する番だ",
      "あずさ…中に入れていい？ ゆっくりあずさの中に入る",
      "腰を動かしながら あずさ、締めつけてくる…奥まで当たってる",
      "もう…限界だ。あずさの中に出していい？",
      "あずさの奥に出す …あずさ…",
    ],
  },
};

interface TurnResult {
  turn: number;
  userMessage: string;
  response: string;
  rawHtml: string;
  checks: {
    hasContent: boolean;
    hasXml: boolean;
    noEnglish: boolean;
    correctFirstPerson: boolean;
    noWrongFirstPerson: boolean;
  };
  pass: boolean;
  durationMs: number;
}

interface ScenarioResult {
  scenario: string;
  turns: TurnResult[];
  totalPass: number;
  totalFail: number;
  durationMs: number;
}

// 英語混入チェック（3文字以上の連続英字。XML/HTMLタグは除外）
function hasEnglishWords(text: string): boolean {
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\b(XML|HTML|SSE|API|OK)\b/gi, "");
  return /[a-zA-Z]{4,}/.test(cleaned);
}

// XML構造チェック（ブラウザレンダリング後のDOM構造で判定）
// StructuredNarrativeコンポーネントがXMLをパースすると、
// space-y-1.5クラスのdiv内にaction(italic)/dialogue(font-medium)/inner(text-xs)が配置される
// 生XMLタグはレンダリング時に除去されるため、DOM構造の存在で間接的に検出する
function hasXmlStructure(html: string): boolean {
  // StructuredNarrativeの出力構造: <div class="space-y-1.5">...</div>
  return html.includes("space-y-1.5") || html.includes("font-medium");
}

// 一人称チェック
function checkFirstPerson(text: string, expected: string, wrongList: string[]): { correct: boolean; noWrong: boolean } {
  const dialogue = text.match(/「([^」]*)」/g)?.join("") ?? text;
  const correct = dialogue.includes(expected);
  const noWrong = !wrongList.some((w) => dialogue.includes(w));
  return { correct, noWrong };
}

const WRONG_FIRST_PERSONS: Record<string, string[]> = {
  あたし: ["僕", "俺", "わたくし", "ワタシ"],
  私: ["僕", "俺", "あたし", "ワタシ"],
};

async function waitForResponse(page: Page): Promise<void> {
  // 送信ボタンがdisabledになるのを待つ（送信開始）
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[title="送信"]');
      return btn?.hasAttribute("disabled");
    },
    { timeout: 5_000 },
  ).catch(() => {});

  // 送信ボタンが再びenabledになるのを待つ（応答完了）
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[title="送信"]');
      return btn && !btn.hasAttribute("disabled");
    },
    { timeout: RESPONSE_TIMEOUT_MS },
  );

  // ストリーミング完了のための追加待機
  await page.waitForTimeout(1_000);
}

async function getLastAssistantMessage(page: Page): Promise<{ text: string; html: string }> {
  return page.evaluate(() => {
    // アシスタントメッセージは flex-row-reverse でないもの
    const allBubbles = document.querySelectorAll(".group\\/message");
    const assistantBubbles = Array.from(allBubbles).filter(
      (el) => !el.classList.contains("flex-row-reverse"),
    );
    const last = assistantBubbles[assistantBubbles.length - 1];
    if (!last) return { text: "", html: "" };
    const bubble = last.querySelector(".rounded-2xl");
    return {
      text: bubble?.textContent ?? "",
      html: bubble?.innerHTML ?? "",
    };
  });
}

async function runScenario(page: Page, scenario: Scenario): Promise<ScenarioResult> {
  const startTime = Date.now();
  const turns: TurnResult[] = [];
  const wrongFirstPersons = WRONG_FIRST_PERSONS[scenario.firstPerson] ?? [];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 ${scenario.name} 開始`);
  console.log(`   キャラ: ${scenario.char} (一人称: ${scenario.firstPerson})`);
  console.log(`${"=".repeat(60)}`);

  // 1. アプリにナビゲート
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2_000);

  // 2. キャラクター選択: キャラクター管理ボタンをクリック
  const charBtn = page.locator('[aria-label="キャラクター管理"]');
  await charBtn.click();
  await page.waitForTimeout(1_000);

  // 3. キャラクターをクリック
  const charItem = page.locator(`button:has-text("${scenario.char}")`).first();
  await charItem.click();
  await page.waitForTimeout(1_000);

  // 4. 新しい会話を作成
  const newConvBtn = page.locator('button:has-text("新しい会話")');
  await newConvBtn.click();
  await page.waitForTimeout(2_000);

  // 5. 各ターンを実行
  for (let i = 0; i < scenario.messages.length; i++) {
    const msg = scenario.messages[i];
    const turnStart = Date.now();

    console.log(`\n  T${i + 1}: ${msg.slice(0, 40)}...`);

    // テキスト入力
    const textarea = page.locator('textarea[placeholder="メッセージを入力..."]');
    await textarea.fill(msg);

    // 送信ボタンクリック
    const sendBtn = page.locator('button[title="送信"]');
    await sendBtn.click();

    // 応答待ち
    try {
      await waitForResponse(page);
    } catch (err) {
      console.log(`  ⚠️  T${i + 1}: 応答タイムアウト`);
      turns.push({
        turn: i + 1,
        userMessage: msg,
        response: "[TIMEOUT]",
        rawHtml: "",
        checks: { hasContent: false, hasXml: false, noEnglish: false, correctFirstPerson: false, noWrongFirstPerson: false },
        pass: false,
        durationMs: Date.now() - turnStart,
      });
      continue;
    }

    // 応答を取得
    const { text, html } = await getLastAssistantMessage(page);
    const durationMs = Date.now() - turnStart;

    // 品質チェック
    const xmlCheck = hasXmlStructure(html) || hasXmlStructure(text);
    const englishCheck = !hasEnglishWords(text);
    const fpCheck = checkFirstPerson(text, scenario.firstPerson, wrongFirstPersons);

    const checks = {
      hasContent: text.length > 0,
      hasXml: xmlCheck,
      noEnglish: englishCheck,
      correctFirstPerson: fpCheck.correct,
      noWrongFirstPerson: fpCheck.noWrong,
    };
    const pass = checks.hasContent && checks.noEnglish && checks.noWrongFirstPerson;

    turns.push({
      turn: i + 1,
      userMessage: msg,
      response: text.slice(0, 300),
      rawHtml: html.slice(0, 500),
      checks,
      pass,
      durationMs,
    });

    const status = pass ? "✅" : "❌";
    console.log(
      `  ${status} T${i + 1}: ${text.slice(0, 60).replace(/\n/g, " ")}... (${(durationMs / 1000).toFixed(1)}s)`,
    );
    if (!checks.hasContent) console.log(`     ⚠ 空レスポンス`);
    if (!checks.noEnglish) console.log(`     ⚠ 英語混入`);
    if (!checks.noWrongFirstPerson) console.log(`     ⚠ 一人称異常`);

    // スクリーンショット
    await page.screenshot({
      path: `e2e-results/${scenario.char}-T${i + 1}.png`,
      fullPage: false,
    });

    // レートリミット対策
    if (i < scenario.messages.length - 1) {
      await page.waitForTimeout(TURN_COOLDOWN_MS);
    }
  }

  const totalPass = turns.filter((t) => t.pass).length;
  const totalFail = turns.filter((t) => !t.pass).length;

  console.log(`\n  📊 ${scenario.name}: ${totalPass}/${turns.length} PASS`);

  return {
    scenario: scenario.name,
    turns,
    totalPass,
    totalFail,
    durationMs: Date.now() - startTime,
  };
}

async function main() {
  console.log("🔗 Chrome CDP (port 9222) に接続中...");

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const contexts = browser.contexts();
  const context = contexts[0] ?? (await browser.newContext());

  // 結果ディレクトリ作成
  const { mkdirSync } = await import("fs");
  mkdirSync("e2e-results", { recursive: true });

  // 3ページ（タブ）を作成
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const pageC = await context.newPage();

  console.log("📄 3タブ作成完了。並行テスト開始...\n");

  const startTime = Date.now();

  // 3シナリオ並行実行
  const [resultA, resultB, resultC] = await Promise.all([
    runScenario(pageA, SCENARIOS.A),
    runScenario(pageB, SCENARIOS.B),
    runScenario(pageC, SCENARIOS.C),
  ]);

  const totalDuration = Date.now() - startTime;

  // サマリー出力
  console.log(`\n${"═".repeat(60)}`);
  console.log("📋 全シナリオ結果サマリー");
  console.log(`${"═".repeat(60)}`);

  for (const result of [resultA, resultB, resultC]) {
    const icon = result.totalFail === 0 ? "✅" : "❌";
    console.log(`  ${icon} ${result.scenario}: ${result.totalPass}/${result.turns.length} PASS (${(result.durationMs / 1000).toFixed(0)}s)`);
    for (const t of result.turns) {
      if (!t.pass) {
        const failReasons = [];
        if (!t.checks.hasContent) failReasons.push("空レスポンス");
        if (!t.checks.noEnglish) failReasons.push("英語混入");
        if (!t.checks.noWrongFirstPerson) failReasons.push("一人称異常");
        console.log(`     ❌ T${t.turn}: ${failReasons.join(", ")}`);
      }
    }
  }

  const allResults = [resultA, resultB, resultC];
  const totalTurns = allResults.reduce((sum, r) => sum + r.turns.length, 0);
  const totalPass = allResults.reduce((sum, r) => sum + r.totalPass, 0);
  console.log(`\n  合計: ${totalPass}/${totalTurns} PASS (${(totalDuration / 1000).toFixed(0)}s)`);

  // 詳細JSON出力
  const { writeFileSync } = await import("fs");
  writeFileSync(
    "e2e-results/results.json",
    JSON.stringify({ timestamp: new Date().toISOString(), results: allResults, totalDuration }, null, 2),
  );
  console.log("\n📁 詳細結果: e2e-results/results.json");
  console.log("📸 スクリーンショット: e2e-results/*.png");

  // クリーンアップ（作成したタブだけ閉じる）
  await pageA.close();
  await pageB.close();
  await pageC.close();

  // CDPで接続したブラウザは閉じない（ユーザーのChromeなので）
  browser.disconnect();

  // 終了コード
  const allPass = allResults.every((r) => r.totalFail === 0);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("💥 テスト実行エラー:", err);
  process.exit(2);
});
