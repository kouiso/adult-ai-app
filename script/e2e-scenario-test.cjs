/**
 * 3シナリオ並行ブラウザテスト
 * 既存Chrome(CDP port 9222)に接続し、3タブで同時実行
 *
 * 使い方: node script/e2e-scenario-test.cjs
 */
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("fs");

const BASE_URL = "http://localhost:8788";
const CDP_ENDPOINT = "http://localhost:9222";
const RESPONSE_TIMEOUT_MS = 120_000;
const TURN_COOLDOWN_MS = 3_000;

const SCENARIOS = {
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

const WRONG_FIRST_PERSONS = {
  "あたし": ["僕", "俺", "わたくし", "ワタシ"],
  "私": ["僕", "俺", "あたし", "ワタシ"],
};

function hasEnglishWords(text) {
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\b(XML|HTML|SSE|API|OK)\b/gi, "");
  return /[a-zA-Z]{4,}/.test(cleaned);
}

function hasXmlStructure(text) {
  return /<response>/.test(text) || /<dialogue>/.test(text) || /<action>/.test(text);
}

function checkFirstPerson(text, expected, wrongList) {
  const dialogue = (text.match(/「([^」]*)」/g) || []).join("") || text;
  const correct = dialogue.includes(expected);
  const noWrong = !wrongList.some((w) => dialogue.includes(w));
  return { correct, noWrong };
}

async function waitForResponse(page, prevBubbleCount) {
  // アシスタントの新しいバブルが出現するのを待つ
  await page.waitForFunction(
    (prev) => {
      const all = [...document.querySelectorAll("[class*='group/message']")];
      const assistant = all.filter((el) => !el.className.includes("flex-row-reverse"));
      return assistant.length > prev;
    },
    prevBubbleCount,
    { timeout: RESPONSE_TIMEOUT_MS },
  );

  // ストリーミング完了を待つ（送信ボタンがenabledに戻るまで）
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[title="送信"]');
      return btn && !btn.hasAttribute("disabled");
    },
    { timeout: 30_000 },
  ).catch(() => {});

  // ストリーミング完了のための追加待機
  await page.waitForTimeout(2_000);
}

async function getLastAssistantMessage(page) {
  return page.evaluate(() => {
    // group/message クラスのdiv。flex-row-reverseがないのがアシスタント
    const allBubbles = [...document.querySelectorAll("[class*='group/message']")];
    const assistantBubbles = allBubbles.filter(
      (el) => !el.className.includes("flex-row-reverse"),
    );
    const last = assistantBubbles[assistantBubbles.length - 1];
    if (!last) return { text: "", html: "" };
    const bubble = last.querySelector("[class*='rounded-2xl']");
    return {
      text: bubble ? bubble.textContent : "",
      html: bubble ? bubble.innerHTML : "",
    };
  });
}

/**
 * セットアップフェーズ: キャラ選択 → 新しい会話作成
 * activeCharacterIdがlocalStorageで共有されるため、この処理は1タブずつ順番に実行する必要がある。
 * 会話がD1に作成された後はcharacterIdがサーバー側でバインドされるため、並行メッセージ送信は安全。
 */
async function setupScenario(page, scenario) {
  console.log(`\n  📋 ${scenario.char} のセットアップ開始...`);

  // 1. アプリにナビゲート
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(3000);

  // 2. キャラクター選択
  const charBtn = page.locator('[aria-label="キャラクター管理"]');
  await charBtn.click();
  await page.waitForTimeout(1500);

  // 3. キャラクターをクリック
  const charItem = page.locator(`button:has-text("${scenario.char}")`).first();
  try {
    await charItem.click({ timeout: 5000, force: true });
  } catch (e) {
    console.log(`  ⚠️  キャラ「${scenario.char}」が見つからない: ${e.message}`);
    return false;
  }
  await page.waitForTimeout(1000);

  // 3.5. シートを閉じる（Escキーでオーバーレイを消す）
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);

  // 4. 新しい会話を作成（data-slot="button"で正確にUI上のボタンを特定）
  const newConvBtn = page.locator('button[data-slot="button"]:has-text("新しい会話")');
  await newConvBtn.click();
  await page.waitForTimeout(2000);

  // 5. 会話のグリーティングが表示されるのを待つ（キャラバインド確認の代わり）
  try {
    await page.waitForFunction(
      () => {
        const all = [...document.querySelectorAll("[class*='group/message']")];
        const assistant = all.filter((el) => !el.className.includes("flex-row-reverse"));
        return assistant.length > 0;
      },
      { timeout: 5000 },
    ).catch(() => {});
  } catch {
    // グリーティングがないキャラもいるので無視
  }

  console.log(`  ✅ ${scenario.char} セットアップ完了`);
  return true;
}

async function runScenario(page, scenario) {
  const startTime = Date.now();
  const turns = [];
  const wrongFirstPersons = WRONG_FIRST_PERSONS[scenario.firstPerson] || [];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 ${scenario.name} メッセージ送信開始`);
  console.log(`   キャラ: ${scenario.char} (一人称: ${scenario.firstPerson})`);
  console.log(`${"=".repeat(60)}`);

  // 各ターンを実行（セットアップは既に完了済み）
  for (let i = 0; i < scenario.messages.length; i++) {
    const msg = scenario.messages[i];
    const turnStart = Date.now();

    console.log(`  T${i + 1}: ${msg.slice(0, 50)}...`);

    // テキスト入力
    const textarea = page.locator('textarea[placeholder="メッセージを入力..."]');
    await textarea.fill(msg);
    await page.waitForTimeout(300);

    // 送信前のアシスタントバブル数を取得
    const prevBubbleCount = await page.evaluate(() => {
      const all = [...document.querySelectorAll("[class*='group/message']")];
      return all.filter((el) => !el.className.includes("flex-row-reverse")).length;
    });

    // 送信ボタンクリック
    const sendBtn = page.locator('button[title="送信"]');
    await sendBtn.click();

    // 応答待ち
    try {
      await waitForResponse(page, prevBubbleCount);
    } catch (err) {
      console.log(`  ⚠️  T${i + 1}: 応答タイムアウト (${RESPONSE_TIMEOUT_MS / 1000}s)`);
      turns.push({
        turn: i + 1,
        userMessage: msg,
        response: "[TIMEOUT]",
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
      checks,
      pass,
      durationMs,
    });

    const status = pass ? "✅" : "❌";
    console.log(
      `  ${status} T${i + 1}: ${text.slice(0, 80).replace(/\n/g, " ")} (${(durationMs / 1000).toFixed(1)}s)`,
    );
    if (!checks.hasContent) console.log(`     ⚠ 空レスポンス`);
    if (!checks.noEnglish) console.log(`     ⚠ 英語混入`);
    if (!checks.noWrongFirstPerson) console.log(`     ⚠ 一人称異常`);

    // スクリーンショット
    try {
      await page.screenshot({
        path: `e2e-results/${scenario.char}-T${i + 1}.png`,
        fullPage: false,
      });
    } catch (e) {
      console.log(`     スクリーンショット失敗: ${e.message}`);
    }

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
  const ctx = browser.contexts()[0];
  if (!ctx) {
    console.error("❌ ブラウザコンテキストが取得できません");
    process.exit(2);
  }

  mkdirSync("e2e-results", { recursive: true });

  // 3ページ（タブ）を作成
  const pageA = await ctx.newPage();
  const pageB = await ctx.newPage();
  const pageC = await ctx.newPage();

  console.log("📄 3タブ作成完了。セットアップ開始...\n");

  const startTime = Date.now();

  // セットアップは順番に実行（localStorageのactiveCharacterIdが共有されるため並行不可）
  // 各タブでキャラ選択→会話作成を完了させてからメッセージ送信を並行化する
  const setupPairs = [
    { page: pageA, scenario: SCENARIOS.A },
    { page: pageB, scenario: SCENARIOS.B },
    { page: pageC, scenario: SCENARIOS.C },
  ];

  for (const { page, scenario } of setupPairs) {
    const ok = await setupScenario(page, scenario);
    if (!ok) {
      console.error(`❌ ${scenario.char} のセットアップに失敗`);
      process.exit(2);
    }
  }

  console.log("\n📤 全キャラセットアップ完了。メッセージ送信を並行開始...\n");

  // メッセージ送信は並行実行OK（各会話はサーバー側でcharacterIdがバインド済み）
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
    if (result.error) {
      console.log(`  ❌ ${result.scenario}: ${result.error}`);
      continue;
    }
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
  writeFileSync(
    "e2e-results/results.json",
    JSON.stringify({ timestamp: new Date().toISOString(), results: allResults, totalDuration }, null, 2),
  );
  console.log("\n📁 詳細結果: e2e-results/results.json");
  console.log("📸 スクリーンショット: e2e-results/*.png");

  // クリーンアップ
  await pageA.close().catch(() => {});
  await pageB.close().catch(() => {});
  await pageC.close().catch(() => {});

  const allPass = allResults.every((r) => r.totalFail === 0 && !r.error);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("💥 テスト実行エラー:", err);
  process.exit(2);
});
