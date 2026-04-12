import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = "/Users/kouiso/ghq/kouiso/adult-ai-app";
const RESULTS_DIR = join(ROOT, "e2e-results");

const SCENARIOS = [
  {
    name: "scenario-B",
    charId: "char-mitsuki",
    charLabel: "みつき",
    turns: [
      "遅くまでやってるんだね。ウィスキー、ロックで。みつきさんはいつからバーテンダーやってるの？",
      "…綺麗な手だな。カクテル作る手つきがすごく好き。もう閉店？最後の一杯、一緒にどう？",
      "カウンター越しにみつきの手に触れる …冷たいな、この手。温めてあげたい",
    ],
  },
  {
    name: "scenario-C",
    charId: "char-azusa",
    charLabel: "あずさ",
    turns: [
      "先生、今日の検査ちょっと緊張するんですけど…いつもこんなに近いんですか？",
      "先生の手、冷たくて気持ちいい…。もっと診てほしいです",
      "あずさの白衣を脱がせる …先生、白衣の下すごいね。もう先生じゃなくてあずさって呼んでいい？",
    ],
  },
];

// AI応答を待つ（ストリーミング完了まで）
async function waitForResponse(page, previousMessageCount, timeoutMs = 120_000) {
  const start = Date.now();
  // メッセージが追加されるまで待つ
  while (Date.now() - start < timeoutMs) {
    const count = await page.locator('[class*="message-bubble"], [class*="MessageBubble"], .rounded-2xl.px-4.py-3').count();
    if (count > previousMessageCount) break;
    await page.waitForTimeout(500);
  }
  // ストリーミング完了を待つ（ローディングインジケータ消失 or テキスト安定）
  let lastText = "";
  let stableCount = 0;
  while (Date.now() - start < timeoutMs && stableCount < 3) {
    await page.waitForTimeout(2000);
    const allText = await page.locator("main").innerText().catch(() => "");
    if (allText === lastText && allText.length > 0) {
      stableCount++;
    } else {
      stableCount = 0;
      lastText = allText;
    }
  }
  // 少し余分に待ってレンダリング完了を保証
  await page.waitForTimeout(1000);
}

async function runScenario(browser, scenario) {
  const dir = join(RESULTS_DIR, scenario.name);
  mkdirSync(dir, { recursive: true });

  // 新しいページ（タブ）でシナリオを実行
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("http://localhost:8788", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  console.log(`\n=== ${scenario.name}: ${scenario.charLabel} ===`);

  // キャラクター管理を開く
  // ヘッダーの Users アイコンボタンをクリック（SheetTrigger）
  const charBtn = page.locator("header button").first();
  await charBtn.click();
  await page.waitForTimeout(2000);

  // キャラクターシートのスクリーンショット
  await page.screenshot({ path: join(dir, "step1-char-sheet.png") });

  // シート内のキャラクターを選択（force:trueでoverlay回避）
  // SheetContent内のボタンをクリック
  const sheetContent = page.locator('[data-slot="sheet-content"]');
  const charButton = sheetContent.locator(`button:has-text("${scenario.charLabel}")`).first();
  if (await charButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await charButton.click({ force: true });
    console.log(`  Selected character: ${scenario.charLabel}`);
  } else {
    // フォールバック: シート内全ボタンからテキスト検索
    console.log(`  Trying fallback character selection for ${scenario.charLabel}...`);
    const allBtns = sheetContent.locator("button");
    const count = await allBtns.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const text = await allBtns.nth(i).innerText().catch(() => "");
      if (text.includes(scenario.charLabel)) {
        await allBtns.nth(i).click({ force: true });
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`  WARNING: Could not find character ${scenario.charLabel}`);
      // デバッグ用: シート内容を出力
      const sheetText = await sheetContent.innerText().catch(() => "N/A");
      console.log(`  Sheet content: ${sheetText.substring(0, 300)}`);
    }
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(dir, "step2-char-selected.png") });

  // シートを閉じる
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);

  // 新しい会話を作成 - サイドバーまたはメイン画面から
  // まずサイドバーが見えるか確認
  const plusBtn = page.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
  if (await plusBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await plusBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: join(dir, "step3-new-conv.png") });

  const results = [];

  for (let t = 0; t < scenario.turns.length; t++) {
    const turnNum = t + 1;
    const message = scenario.turns[t];
    console.log(`  Turn ${turnNum}: sending message...`);

    // メッセージ送信前のメッセージ数を取得
    const msgCountBefore = await page.locator(".rounded-2xl.px-4.py-3, [class*='bubble']").count().catch(() => 0);

    // テキストエリアを探して入力
    const textarea = page.locator("textarea").first();
    await textarea.click();
    await textarea.fill(message);
    await page.waitForTimeout(500);

    // 送信ボタンをクリック (Ctrl+Enter or 送信ボタン)
    await page.keyboard.down("Meta");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Meta");
    await page.waitForTimeout(1000);

    // AI応答を待つ
    console.log(`  Turn ${turnNum}: waiting for response...`);
    await waitForResponse(page, msgCountBefore);

    // スクリーンショット
    const screenshotPath = join(dir, `turn${turnNum}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Turn ${turnNum}: screenshot saved to ${screenshotPath}`);

    // 最新のアシスタントメッセージのテキストを取得
    const allMessages = page.locator("main .rounded-2xl.px-4.py-3, main [class*='bubble']");
    const lastMsg = allMessages.last();
    const responseText = await lastMsg.innerText().catch(() => "[could not extract text]");

    // 品質評価
    const evaluation = evaluateResponse(responseText, scenario, turnNum);
    results.push({
      turn: turnNum,
      message,
      responsePreview: responseText.substring(0, 200),
      ...evaluation,
    });
    console.log(`  Turn ${turnNum}: ${evaluation.pass ? "PASS" : "FAIL"} - ${evaluation.notes}`);
  }

  // ページ全体の最終スクリーンショット
  await page.screenshot({ path: join(dir, "final.png"), fullPage: true });
  await page.close();

  return results;
}

function evaluateResponse(text, scenario, turnNum) {
  const issues = [];

  // 空レスポンスチェック
  if (!text || text.trim().length < 10) {
    return { pass: false, notes: "Empty or very short response", hasXml: false, hasCharVoice: false, issues: ["empty_response"] };
  }

  // 拒否チェック
  const refusalPatterns = [
    "申し訳", "できません", "inappropriate", "I cannot", "I can't",
    "not appropriate", "as an AI", "AIとして",
  ];
  const isRefusal = refusalPatterns.some((p) => text.toLowerCase().includes(p.toLowerCase()));

  // 英語混入チェック（4文字以上の連続英字を検出）
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\b(XML|HTML|SSE|API|OK)\b/gi, "");
  const hasEnglish = /[a-zA-Z]{4,}/.test(cleaned);

  // 一人称チェック
  const wrongFirstPersons = scenario.charId === "char-mitsuki"
    ? ["僕", "俺", "わたくし", "ワタシ"]
    : scenario.charId === "char-azusa"
      ? ["僕", "俺", "あたし", "ワタシ"]
      : [];
  const hasWrongFirstPerson = wrongFirstPersons.some((w) => text.includes(w));

  // キャラ声チェック（一人称の存在で判定）
  const hasCharVoice = text.includes(scenario.firstPerson);

  if (isRefusal) issues.push("refusal_detected");
  if (hasEnglish) issues.push("english_detected");
  if (hasWrongFirstPerson) issues.push("wrong_first_person");
  if (text.length < 50) issues.push("response_too_short");
  if (!hasCharVoice && text.length > 30) issues.push("missing_char_voice");

  const pass = !isRefusal && !hasEnglish && !hasWrongFirstPerson && text.length >= 50;
  const notes = isRefusal
    ? "REFUSAL detected"
    : `${text.length}chars, voice=${hasCharVoice}${issues.length > 0 ? `, issues: ${issues.join(", ")}` : ""}`;

  // ブラウザレンダリング後はXMLタグが除去されるため、hasXmlは構造的に判定不可
  // APIテスト(test-xml-quality.ts)でXML出力を検証する
  const hasXml = true;

  return { pass, notes, hasXml, hasCharVoice, isRefusal, issues };
}

async function main() {
  console.log("Connecting to headless Chrome on CDP port 9222...");

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    console.log("Connected to CDP!");
  } catch (e) {
    console.error("Failed to connect via CDP. Starting new headless browser...");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
  }

  const allResults = {};

  for (const scenario of SCENARIOS) {
    try {
      const results = await runScenario(browser, scenario);
      allResults[scenario.name] = results;
    } catch (err) {
      console.error(`  ERROR in ${scenario.name}:`, err.message);
      allResults[scenario.name] = [{ error: err.message }];
    }
  }

  // 結果をJSON出力
  const { writeFileSync } = await import("fs");
  writeFileSync(
    join(RESULTS_DIR, "results-bc.json"),
    JSON.stringify(allResults, null, 2),
  );

  console.log("\n=== SUMMARY ===");
  for (const [name, results] of Object.entries(allResults)) {
    console.log(`\n${name}:`);
    for (const r of results) {
      if (r.error) {
        console.log(`  ERROR: ${r.error}`);
      } else {
        console.log(`  T${r.turn}: ${r.pass ? "PASS" : "FAIL"} - ${r.notes}`);
      }
    }
  }

  // CDP接続の場合はdisconnect、自前起動の場合はclose
  if (browser.isConnected()) {
    await browser.close().catch(() => {});
  }
}

main().catch(console.error);
