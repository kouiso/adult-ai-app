#!/usr/bin/env tsx
// XML構造化出力の品質テスト（アダプター経由版）
// 実機ブラウザと同一のメッセージ配列を構築してAPIに送信する
// Usage: pnpm tsx script/test-xml-quality.ts [scenario] [turns]
//   scenario: A (tsukasa), B (mitsuki), C (azusa) — default: A
//   turns: number of turns to test — default: 3

import { buildMessagesForApi, buildRetryMessages } from "../src/lib/chat-message-adapter";
import type { ApiMessage } from "../src/lib/chat-message-adapter";
import { runQualityChecks, MAX_QUALITY_RETRIES } from "../src/lib/quality-guard";
import { isXmlResponse, parseXmlResponse, stripXmlTags } from "../src/lib/xml-response-parser";
import { detectScenePhase } from "../src/lib/scene-phase";

const BASE_URL = "http://localhost:8788";

interface Scenario {
  char: string;
  firstPerson: string;
  wrongFirstPersons: string[];
  messages: string[];
}

const SCENARIOS: Record<string, Scenario> = {
  A: {
    char: "鳴海つかさ",
    firstPerson: "あたし",
    wrongFirstPersons: ["私", "わたし", "僕", "俺"],
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
    char: "月島みつき",
    firstPerson: "あたし",
    wrongFirstPersons: ["私", "わたし", "僕", "俺"],
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
    char: "九条あずさ",
    firstPerson: "私",
    wrongFirstPersons: ["あたし", "僕", "俺"],
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

// SSEストリームからテキストを収集する
async function collectSseResponse(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return accumulated;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) accumulated += content;
      } catch {
        // SSEパース失敗は無視（不完全なチャンクの可能性）
      }
    }
  }
  return accumulated;
}

interface TurnResult {
  turn: number;
  phase: string;
  passed: boolean;
  failedCheck: string | null;
  isXml: boolean;
  plainLen: number;
  totalElapsed: number;
  attempts: number;
  hasSections: { action: boolean; dialogue: boolean; inner: boolean } | null;
}

async function main() {
  const scenarioKey = (process.argv[2] ?? "A").toUpperCase();
  const maxTurns = parseInt(process.argv[3] ?? "3", 10);
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioKey}. Use A, B, or C.`);
    process.exit(1);
  }

  const model = process.env.MODEL ?? "sao10k/l3.3-euryale-70b";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario ${scenarioKey}: ${scenario.char} (${maxTurns} turns)`);
  console.log(`MODEL: ${model}`);
  console.log(`ADAPTER: buildMessagesForApi (same as browser)`);
  console.log(`${"=".repeat(60)}\n`);

  // キャラクターのsystemPromptを取得
  const charsRes = await fetch(`${BASE_URL}/api/characters`);
  const { characters } = (await charsRes.json()) as { characters: { name: string; systemPrompt: string; greeting?: string }[] };
  const char = characters.find((c) => c.name === scenario.char);
  if (!char) {
    console.error(`Character "${scenario.char}" not found. Available:`, characters.map((c) => c.name));
    process.exit(1);
  }

  // 実機と同じ形式で会話履歴を蓄積する（role + content + isStreaming）
  const rawHistory: { role: "user" | "assistant" | "system"; content: string; isStreaming?: boolean }[] = [];

  // greetingがあれば最初のassistantメッセージとして追加
  if (char.greeting) {
    rawHistory.push({ role: "assistant", content: char.greeting });
  }

  let prevAssistantResponse = char.greeting ?? "";
  const prevInnerTexts: string[] = [];
  const results: TurnResult[] = [];
  const turns = Math.min(maxTurns, scenario.messages.length);

  for (let t = 0; t < turns; t++) {
    const userMsg = scenario.messages[t];
    rawHistory.push({ role: "user", content: userMsg });

    // アダプター経由でメッセージ配列を構築（実機と完全同一）
    const apiMessages = buildMessagesForApi(rawHistory, char.systemPrompt, scenario.char);

    // フェーズ検出も実機と同じ関数を使用
    const phase = detectScenePhase(apiMessages);

    console.log(`--- Turn ${t + 1} (phase: ${phase}) ---`);
    console.log(`USER: ${userMsg.slice(0, 60)}...`);

    let attempt = 0;
    let responseText = "";
    let qualityResult = { passed: false, failedCheck: "not-tested" as string | undefined };
    let totalElapsed = 0;
    let currentMessages: ApiMessage[] = apiMessages;

    while (attempt <= MAX_QUALITY_RETRIES) {
      const startTime = Date.now();
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages, model }),
      });

      if (!res.ok) {
        console.error(`API error: ${res.status} ${await res.text()}`);
        results.push({
          turn: t + 1, phase, passed: false,
          failedCheck: `api-error-${res.status}`,
          isXml: false, plainLen: 0, totalElapsed: 0, attempts: attempt + 1, hasSections: null,
        });
        break;
      }

      responseText = await collectSseResponse(res);
      totalElapsed += Date.now() - startTime;

      qualityResult = runQualityChecks(responseText, {
        phase,
        prevAssistantResponse,
        firstPerson: scenario.firstPerson,
        wrongFirstPersons: scenario.wrongFirstPersons,
        prevInnerTexts,
      });

      if (qualityResult.passed || attempt >= MAX_QUALITY_RETRIES) break;

      // リトライ: アダプター経由で統一されたリトライメッセージを構築
      console.log(`  retry ${attempt + 1}: ${qualityResult.failedCheck}`);
      currentMessages = buildRetryMessages(apiMessages, responseText, {
        firstPerson: scenario.firstPerson,
        prevAssistantResponse,
      });
      attempt++;
    }

    const parsed = parseXmlResponse(responseText);
    const isXml = isXmlResponse(responseText);
    const plainLen = (parsed ? stripXmlTags(responseText) : responseText).length;

    console.log(`RESPONSE (${totalElapsed}ms, ${plainLen}chars, xml=${isXml}, attempts=${attempt + 1}):`);
    if (parsed) {
      console.log(`  <action> ${parsed.action.slice(0, 100)}...`);
      console.log(`  <dialogue> ${parsed.dialogue.slice(0, 100)}...`);
      console.log(`  <inner> ${parsed.inner.slice(0, 100)}...`);
    } else {
      console.log(`  RAW: ${responseText.slice(0, 150)}...`);
    }
    console.log(`QUALITY: ${qualityResult.passed ? "✓ PASS" : `✗ FAIL (${qualityResult.failedCheck})`}`);
    console.log();

    results.push({
      turn: t + 1, phase,
      passed: qualityResult.passed,
      failedCheck: qualityResult.failedCheck ?? null,
      isXml, plainLen, totalElapsed,
      attempts: attempt + 1,
      hasSections: parsed ? {
        action: parsed.action.length > 0,
        dialogue: parsed.dialogue.length > 0,
        inner: parsed.inner.length > 0,
      } : null,
    });

    // 最終的な応答をconversation historyに追加
    rawHistory.push({ role: "assistant", content: responseText });
    prevAssistantResponse = parsed ? stripXmlTags(responseText) : responseText;
    if (parsed?.inner && parsed.inner.length >= 5) {
      prevInnerTexts.push(parsed.inner);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(60)}`);
  const passCount = results.filter((r) => r.passed).length;
  const xmlCount = results.filter((r) => r.isXml).length;
  console.log(`Pass: ${passCount}/${turns}`);
  console.log(`XML format: ${xmlCount}/${turns}`);
  for (const r of results) {
    const status = r.passed ? "✓" : "✗";
    console.log(`  T${r.turn} [${r.phase}] ${status} ${r.failedCheck ?? ""} (${r.plainLen}chars, ${r.totalElapsed}ms, xml=${r.isXml}, attempts=${r.attempts})`);
  }

  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log(`\nFailed checks: ${failures.map((f) => f.failedCheck).join(", ")}`);
  }

  process.exit(passCount === turns ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
