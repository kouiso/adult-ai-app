/**
 * 1シナリオ手動テスト — ステップごとにスクリーンショットを撮影
 * 引数で A/B/C を指定: node script/e2e-manual-scenario.cjs A
 */
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("fs");

const BASE_URL = "http://localhost:8788";
const CDP_ENDPOINT = "http://localhost:9222";
const RESPONSE_TIMEOUT_MS = 120_000;

const SCENARIOS = {
  A: { char: "鳴海つかさ", firstPerson: "あたし", messages: [
    "つかさ、まだ残ってたの？今日のプレゼン資料すごくよかったよ。報告書手伝うよ",
    "二人で飲みに行かない？つかさってさ、今の顔すごくかわいい",
    "つかさの顎を持ち上げてキスする …ずっとこうしたかった",
    "つかさのブラウスのボタンを外しながら首筋にキスする つかさ…もっと触りたい",
    "つかさ…入れるよ。ゆっくりいくから",
    "深く腰を動かしながら つかさの中、すごい…きつくて熱い",
    "もう限界…つかさの中に出していい？",
    "つかさの奥に全部出す …つかさ…好きだ。ずっと好きだった",
  ]},
  B: { char: "月島みつき", firstPerson: "あたし", messages: [
    "遅くまでやってるんだね。ウィスキー、ロックで。みつきさんはいつからバーテンダーやってるの？",
    "…綺麗な手だな。カクテル作る手つきがすごく好き。もう閉店？最後の一杯、一緒にどう？",
    "カウンター越しにみつきの手に触れる …冷たいな、この手。温めてあげたい",
    "みつきの首筋にそっと唇を寄せる …ここ、弱いんでしょ？",
    "みつきのベストを脱がせながら深くキスする みつき…奥の部屋、行こう",
    "みつき…入れるよ。ゆっくりみつきの中に入っていく",
    "みつきを抱き上げながら激しく腰を動かす みつき…中に出したい…いい？",
    "みつきの中に深く出す …みつき…最高だ。今夜は帰さないよ",
  ]},
  C: { char: "九条あずさ", firstPerson: "私", messages: [
    "先生、今日の検査ちょっと緊張するんですけど…いつもこんなに近いんですか？",
    "先生の手、冷たくて気持ちいい…。あずさの白衣の袖を掴む もっと診てほしいです",
    "あずさの白衣を脱がせる …先生、白衣の下すごいね。もう先生じゃなくてあずさって呼んでいい？",
    "あずさを診察台に押し倒す 今度は俺が先生を検査する番だ",
    "あずさ…中に入れていい？ ゆっくりあずさの中に入る",
    "腰を動かしながら あずさ、締めつけてくる…奥まで当たってる",
    "もう…限界だ。あずさの中に出していい？",
    "あずさの奥に出す …あずさ…",
  ]},
};

const scenarioKey = process.argv[2] || "A";
const scenario = SCENARIOS[scenarioKey];
if (!scenario) { console.error("Usage: node script/e2e-manual-scenario.cjs A|B|C"); process.exit(1); }

const DIR = `e2e-results/scenario-${scenarioKey}`;

async function waitForResponse(page, prevAssistantCount) {
  // アシスタントメッセージ数が増えるのを待つ
  await page.waitForFunction((prev) => {
    const all = [...document.querySelectorAll("[class*='group/message']")];
    const assistants = all.filter(el => !el.className.includes("flex-row-reverse"));
    return assistants.length > prev;
  }, prevAssistantCount, { timeout: RESPONSE_TIMEOUT_MS });

  // ストリーミング完了を待つ（bouncing dots が消えるまで）
  await page.waitForFunction(() => {
    const dots = document.querySelector(".animate-bounce");
    return !dots;
  }, null, { timeout: 60_000 }).catch(() => {});

  await page.waitForTimeout(1500);
}

async function getAssistantMessages(page) {
  return page.evaluate(() => {
    const allBubbles = [...document.querySelectorAll("[class*='group/message']")];
    return allBubbles.map(el => {
      const isUser = el.className.includes("flex-row-reverse");
      const bubble = el.querySelector("[class*='rounded-2xl']");
      return { role: isUser ? "user" : "assistant", text: bubble?.textContent ?? "" };
    });
  });
}

async function main() {
  mkdirSync(DIR, { recursive: true });

  console.log(`\n🔗 CDP接続中...`);
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Step 1: Navigate
  console.log(`\n📱 Step 1: アプリ読み込み`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/step1-app-loaded.png` });
  console.log(`   📸 ${DIR}/step1-app-loaded.png`);

  // Step 2: Open character manager
  console.log(`\n👤 Step 2: キャラクター管理を開く`);
  await page.locator('[aria-label="キャラクター管理"]').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/step2-char-sheet.png` });
  console.log(`   📸 ${DIR}/step2-char-sheet.png`);

  // Step 3: Select character
  console.log(`\n🎭 Step 3: ${scenario.char} を選択`);
  // Sheet内部のキャラクターボタンをターゲット（オーバーレイの中のコンテンツ）
  const sheetContent = page.locator('[data-slot="sheet-content"]');
  const charButton = sheetContent.locator(`button:has-text("${scenario.char}")`).first();
  await charButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await charButton.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/step3-char-selected.png` });
  console.log(`   📸 ${DIR}/step3-char-selected.png`);

  // Step 4: Create new conversation
  console.log(`\n💬 Step 4: 新しい会話を作成`);
  const newConvBtn = page.getByRole('button', { name: '新しい会話', exact: true });
  await newConvBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/step4-new-conv.png` });
  console.log(`   📸 ${DIR}/step4-new-conv.png`);

  // グリーティング確認
  const greeting = await getAssistantMessages(page);
  if (greeting.length > 0) {
    const g = greeting.find(m => m.role === "assistant");
    if (g) console.log(`   🗨️ グリーティング: ${g.text.slice(0, 100)}`);
  }

  // Step 5-12: Send messages
  const results = [];
  for (let i = 0; i < scenario.messages.length; i++) {
    const msg = scenario.messages[i];
    const turnNum = i + 1;

    console.log(`\n📨 Turn ${turnNum}/8: ${msg.slice(0, 50)}...`);

    // 現在のアシスタントメッセージ数を記録
    const prevCount = await page.evaluate(() => {
      const all = [...document.querySelectorAll("[class*='group/message']")];
      return all.filter(el => !el.className.includes("flex-row-reverse")).length;
    });

    const textarea = page.locator('textarea[placeholder="メッセージを入力..."]');
    await textarea.fill(msg);
    await page.waitForTimeout(300);

    // Ctrl+Enter で送信（送信ボタンがdisabledでも送れる）
    await textarea.press("Control+Enter");

    console.log(`   ⏳ 応答待ち... (現在のアシスタント数: ${prevCount})`);
    const startTime = Date.now();

    try {
      await waitForResponse(page, prevCount);
    } catch (e) {
      console.log(`   ❌ タイムアウト (${RESPONSE_TIMEOUT_MS / 1000}s)`);
      await page.screenshot({ path: `${DIR}/T${turnNum}-timeout.png` });
      results.push({ turn: turnNum, status: "TIMEOUT", response: "", durationMs: Date.now() - startTime });
      continue;
    }

    const durationMs = Date.now() - startTime;

    // スクロールして最新メッセージを表示
    await page.evaluate(() => {
      const container = document.querySelector("[class*='overflow-y-auto']");
      if (container) container.scrollTop = container.scrollHeight;
    });
    await page.waitForTimeout(500);

    // スクリーンショット
    await page.screenshot({ path: `${DIR}/T${turnNum}-response.png` });
    console.log(`   📸 ${DIR}/T${turnNum}-response.png (${(durationMs / 1000).toFixed(1)}s)`);

    // 最新のアシスタントメッセージ取得
    const allMessages = await getAssistantMessages(page);
    const assistantMsgs = allMessages.filter(m => m.role === "assistant");
    const lastResponse = assistantMsgs[assistantMsgs.length - 1]?.text ?? "";

    console.log(`   🗨️ 応答 (${lastResponse.length}字): ${lastResponse.slice(0, 150).replace(/\n/g, " ")}`);

    // 品質メモ
    const hasEnglish = /[a-zA-Z]{4,}/.test(lastResponse.replace(/<[^>]+>/g, ""));
    const hasFP = lastResponse.includes(scenario.firstPerson);
    if (hasEnglish) console.log(`   ⚠️ 英語混入検出`);
    if (!hasFP && lastResponse.length > 0) console.log(`   ⚠️ 一人称「${scenario.firstPerson}」未検出`);

    results.push({
      turn: turnNum,
      status: "OK",
      response: lastResponse.slice(0, 500),
      durationMs,
      charCount: lastResponse.length,
      hasEnglish,
      hasFirstPerson: hasFP,
    });

    // ターン間のクールダウン
    if (i < scenario.messages.length - 1) {
      await page.waitForTimeout(3000);
    }
  }

  // サマリー
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 Scenario ${scenarioKey} (${scenario.char}) 結果サマリー`);
  console.log(`${"═".repeat(60)}`);
  for (const r of results) {
    const icon = r.status === "OK" ? "✅" : "❌";
    console.log(`  ${icon} T${r.turn}: ${r.charCount ?? 0}字 ${r.hasEnglish ? "⚠英語" : ""} ${r.hasFirstPerson === false && r.status === "OK" ? "⚠一人称" : ""} (${(r.durationMs / 1000).toFixed(1)}s)`);
  }

  const passCount = results.filter(r => r.status === "OK" && !r.hasEnglish).length;
  console.log(`\n  合計: ${passCount}/${results.length} PASS`);

  // JSON保存
  writeFileSync(`${DIR}/results.json`, JSON.stringify({ scenario: scenarioKey, char: scenario.char, results, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\n📁 ${DIR}/results.json`);
  console.log(`📸 ${DIR}/T*.png`);

  await page.close().catch(() => {});
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch(e => { console.error("💥", e); process.exit(2); });
