#!/usr/bin/env node
// XML構造化出力の品質テスト
// APIを直接叩き、品質ガードと同じチェックをサーバーサイドで再現する
// Usage: node script/test-xml-quality.mjs [scenario] [turns]
//   scenario: A (tsukasa), B (mitsuki), C (azusa) — default: A
//   turns: number of turns to test — default: 3

const BASE_URL = "http://localhost:8788";

const SCENARIOS = {
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

// ── XML Parser (quality-guard.tsと同一ロジック) ──
function isXmlResponse(text) {
  return text.includes("<response>") && text.includes("</response>");
}

function parseXmlResponse(text) {
  const responseMatch = text.match(/<response>([\s\S]*?)<\/response>/);
  if (!responseMatch) return null;
  const inner = responseMatch[1];
  const action = inner.match(/<action>([\s\S]*?)<\/action>/)?.[1]?.trim() ?? "";
  const dialogue = inner.match(/<dialogue>([\s\S]*?)<\/dialogue>/)?.[1]?.trim() ?? "";
  const innerText = inner.match(/<inner>([\s\S]*?)<\/inner>/)?.[1]?.trim() ?? "";
  return { action, dialogue, inner: innerText, raw: text };
}

function stripXmlTags(text) {
  return text.replace(/<\/?(?:response|action|dialogue|inner)>/g, "").trim();
}

// ── Quality checks (quality-guard.tsから移植) ──
function bigramSimilarity(a, b) {
  if (a.length < 4 || b.length < 4) return 0;
  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return intersection / Math.min(setA.size, setB.size);
}

function runQualityChecks(response, context) {
  const parsed = parseXmlResponse(response);
  const plainText = parsed ? stripXmlTags(response) : response;

  // 一人称チェック
  if (context.wrongFirstPersons?.length > 0) {
    const wrong = context.wrongFirstPersons.find((fp) => plainText.includes(fp));
    if (wrong) return { passed: false, failedCheck: `wrong-first-person(${wrong})` };
  }

  // 英語混入チェック
  if (/[a-zA-Z]{3,}/.test(plainText)) {
    return { passed: false, failedCheck: "no-english" };
  }

  // XMLフォーマットチェック
  if (!isXmlResponse(response)) {
    return { passed: false, failedCheck: "xml-format-missing" };
  }

  // XML固有チェック
  if (parsed) {
    const thirdPersonPatterns = ["彼女は", "彼女の", "彼女が", "彼女を", "彼は", "彼の", "彼が", "彼を"];
    if (parsed.action && thirdPersonPatterns.some((p) => parsed.action.includes(p))) {
      return { passed: false, failedCheck: "third-person-in-action" };
    }
    if (context.phase !== "conversation" && parsed.inner.length < 5) {
      return { passed: false, failedCheck: "inner-missing" };
    }
  }

  // ユーザー漏れ
  if (plainText.includes("ユーザー")) {
    return { passed: false, failedCheck: "user-leak" };
  }

  // 最低文字数
  if (context.phase !== "conversation" && plainText.length < 80) {
    return { passed: false, failedCheck: `scene-min-length(${plainText.length})` };
  }

  // ターン間類似度
  if (context.prevAssistantResponse) {
    const sim = bigramSimilarity(plainText, context.prevAssistantResponse);
    if (sim >= 0.55) {
      return { passed: false, failedCheck: `cross-turn-similarity(${sim.toFixed(2)})` };
    }
  }

  // フレーズ単位のターン間重複チェック
  if (context.prevAssistantResponse) {
    const extractPhrases = (text) =>
      text.split(/[。！？\n…」]/).map((s) => s.replace(/[「]/g, "").trim()).filter((s) => s.length >= 8 && s.length <= 40);
    const currentPhrases = extractPhrases(plainText);
    const prevPhrases = extractPhrases(context.prevAssistantResponse);
    if (currentPhrases.length > 0 && prevPhrases.length > 0) {
      let matchCount = 0;
      for (const curr of currentPhrases) {
        for (const prev of prevPhrases) {
          if (bigramSimilarity(curr, prev) >= 0.7) { matchCount++; break; }
        }
        if (matchCount >= 2) return { passed: false, failedCheck: "cross-turn-phrase-duplicate" };
      }
    }
  }

  // <inner>ターン間多様性チェック
  if (parsed && context.prevInnerTexts?.length > 0 && parsed.inner.length >= 5) {
    const recentInners = context.prevInnerTexts.slice(-2);
    for (const prev of recentInners) {
      if (prev.length >= 5 && bigramSimilarity(parsed.inner, prev) >= 0.5) {
        return { passed: false, failedCheck: `inner-repetitive(sim=${bigramSimilarity(parsed.inner, prev).toFixed(2)})` };
      }
    }
  }

  // 最大文字数
  if (plainText.length > 500) {
    return { passed: false, failedCheck: `max-length-exceeded(${plainText.length})` };
  }

  return { passed: true };
}

// ── Phase detection (同一ロジック) ──
const PHASE_ORDER = [
  {
    phase: "climax",
    keywords: ["いく", "イク", "イッ", "出して", "中に出", "射精", "どくどく", "びくびく", "痙攣", "絶頂", "アクメ", "果て"],
  },
  {
    phase: "erotic",
    keywords: ["挿入", "奥まで", "腰を振", "突き", "濡れ", "感じて", "咥え", "しゃぶ", "腰が動", "締めつけ", "ピストン", "中に入", "入れる", "入れて", "腰を動", "喘", "あえ"],
  },
  {
    phase: "intimate",
    keywords: ["キス", "唇", "抱きしめ", "舐め", "吸い", "揉", "乳首", "下着", "脱が", "脱い", "ボタン", "ブラウス", "シャツ", "裸", "肌", "胸", "触れ"],
  },
];

function detectPhase(userMessages) {
  const text = userMessages.slice(-3).join("");
  for (const { phase, keywords } of PHASE_ORDER) {
    if (keywords.some((kw) => text.includes(kw))) return phase;
  }
  return "conversation";
}

// ── SSE stream reader ──
async function collectSseResponse(response) {
  const reader = response.body.getReader();
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
      } catch {}
    }
  }
  return accumulated;
}

// ── Main test runner ──
async function main() {
  const scenarioKey = (process.argv[2] ?? "A").toUpperCase();
  const maxTurns = parseInt(process.argv[3] ?? "3", 10);
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioKey}. Use A, B, or C.`);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario ${scenarioKey}: ${scenario.char} (${maxTurns} turns)`);
  console.log(`${"=".repeat(60)}\n`);

  // キャラクターのsystemPromptを取得
  const charsRes = await fetch(`${BASE_URL}/api/characters`);
  const { characters } = await charsRes.json();
  const char = characters.find((c) => c.name === scenario.char);
  if (!char) {
    console.error(`Character "${scenario.char}" not found. Available:`, characters.map((c) => c.name));
    process.exit(1);
  }

  const conversationMessages = [
    { role: "system", content: char.systemPrompt },
  ];

  // greetingがあれば最初のassistantメッセージとして追加
  if (char.greeting) {
    conversationMessages.push({ role: "assistant", content: char.greeting });
  }

  let prevAssistantResponse = char.greeting ?? "";
  const prevInnerTexts = [];
  const results = [];
  const turns = Math.min(maxTurns, scenario.messages.length);

  for (let t = 0; t < turns; t++) {
    const userMsg = scenario.messages[t];
    conversationMessages.push({ role: "user", content: userMsg });

    const userMessages = conversationMessages.filter((m) => m.role === "user").map((m) => m.content);
    const phase = detectPhase(userMessages);

    console.log(`--- Turn ${t + 1} (phase: ${phase}) ---`);
    console.log(`USER: ${userMsg.slice(0, 60)}...`);

    const MAX_RETRIES = 5;
    let attempt = 0;
    let responseText = "";
    let qualityResult = { passed: false, failedCheck: "not-tested" };
    let totalElapsed = 0;
    let retryMessages = [...conversationMessages];

    while (attempt <= MAX_RETRIES) {
      const startTime = Date.now();
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: retryMessages,
          model: "sao10k/l3.3-euryale-70b",
        }),
      });

      if (!res.ok) {
        console.error(`API error: ${res.status} ${await res.text()}`);
        results.push({ turn: t + 1, phase, passed: false, failedCheck: `api-error-${res.status}`, attempts: attempt + 1 });
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

      if (qualityResult.passed || attempt >= MAX_RETRIES) break;

      // リトライ: フロントエンドと同じ再生成指示
      console.log(`  retry ${attempt + 1}: ${qualityResult.failedCheck}`);
      const fpHint = scenario.firstPerson
        ? `\n一人称は必ず「${scenario.firstPerson}」を使え。「私」「僕」「俺」は禁止。`
        : "";
      retryMessages = [
        ...conversationMessages,
        { role: "assistant", content: responseText },
        {
          role: "user",
          content: `この応答は品質基準を満たしていない。完全に異なる場面展開・身体感覚・感情で書き直せ。前の応答の単語を再利用するな。必ず<response>タグで囲んだXMLフォーマットで出力しろ。${fpHint}`,
        },
      ];
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
      turn: t + 1,
      phase,
      passed: qualityResult.passed,
      failedCheck: qualityResult.failedCheck ?? null,
      isXml,
      plainLen,
      totalElapsed,
      attempts: attempt + 1,
      hasSections: parsed ? { action: parsed.action.length > 0, dialogue: parsed.dialogue.length > 0, inner: parsed.inner.length > 0 } : null,
    });

    // 最終的な応答をconversation historyに追加
    conversationMessages.push({ role: "assistant", content: responseText });
    prevAssistantResponse = parsed ? stripXmlTags(responseText) : responseText;
    // <inner>テキストを蓄積（多様性チェック用）
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
    console.log(`  T${r.turn} [${r.phase}] ${status} ${r.failedCheck ?? ""} (${r.plainLen}chars, ${r.totalElapsed ?? r.elapsed ?? 0}ms, xml=${r.isXml}, attempts=${r.attempts ?? 1})`);
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
