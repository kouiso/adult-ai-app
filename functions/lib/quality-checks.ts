/* eslint-disable security/detect-unsafe-regex, unicorn/better-regex */
export type ScenePhase = "climax" | "erotic" | "intimate" | "conversation" | "afterglow";

export interface QualityCheckContext {
  phase: ScenePhase;
  prevTexts?: string[];
}

export interface QualityResult {
  passed: boolean;
  failedCheck?: string;
}

function isXmlResponse(text: string): boolean {
  return text.includes("<response>") && text.includes("</response>");
}

function extractTag(text: string, tag: "action" | "dialogue" | "inner"): string {
  const patterns = {
    action: /<action>([\S\s]*?)<\/action>/,
    dialogue: /<dialogue>([\S\s]*?)<\/dialogue>/,
    inner: /<inner>([\S\s]*?)<\/inner>/,
  } as const;
  return text.match(patterns[tag])?.[1]?.trim() ?? "";
}

function stripXmlTags(text: string): string {
  return text
    .replace(/<remember>[\S\s]*?<\/remember>/g, "")
    .replace(/<\/?(?:response|action|dialogue|inner|narration|remember)>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const META_PROMPT_ECHO_PATTERNS = [
  /Output rules recap/i,
  /EXACT XML structure/i,
  /100% Japanese output only/i,
  /English FORBIDDEN/i,
  /English is forbidden/i,
  /ALWAYS use/i,
] as const;

const META_REMARK_PATTERNS = [
  /AI として/u,
  /AIとして/u,
  /アシスタントとして/u,
  /i'm an ai/i,
  /as an ai/i,
  /申し訳ありません/u,
  /お手伝いできません/u,
  /i cannot/i,
  /i'm unable/i,
  /システムプロンプト/u,
  /system prompt/i,
  /この(?:会話|対話)は.{0,20}(?:フィクション|ロールプレイ|架空)/u,
  /描写できません/u,
  /詳細は割愛/u,
  /これ以上の描写は/u,
  /物語は一旦ここで/u,
  /続きはご想像/u,
] as const;

const CONVERSATION_ESCALATION_PATTERNS = [
  /キス/u,
  /唇を[重舐]/u,
  /首筋/u,
  /抱き寄せ/u,
  /抱きしめ/u,
  /引き寄せ/u,
  /押し倒/u,
  /ブラ(?:ウス)?/u,
  /ボタン/u,
  /下着/u,
  /脱が/u,
  /胸/u,
  /乳首/u,
  /太もも/u,
  /脚を開/u,
  /濡れ/u,
  /挿入/u,
  /奥まで/u,
] as const;

const AFTERGLOW_ALLOW_PATTERNS = [
  /達し/u,
  /イッ(?:た|て)/u,
  /余韻/u,
  /収ま/u,
  /息を整え/u,
  /ぐったり/u,
  /終わっ/u,
  /果て/u,
  /脱力/u,
  /おやすみ/u,
  /寝息/u,
  /眠(?:る|り|れ)/u,
  /胸に顔/u,
  /寄りかか/u,
  /立ち上が/u,
  /ふらつ/u,
  /足元/u,
  /支え/u,
  /甘え/u,
] as const;

const SIMPLIFIED_CHINESE_MARKERS = new Set([
  "记",
  "识",
  "说",
  "谈",
  "还",
  "认",
  "让",
  "给",
  "决",
  "语",
  "问",
  "将",
  "现",
  "实",
  "应",
  "会",
  "经",
  "历",
  "进",
  "运",
  "时",
]);

function checkMultilingualLeak(response: string): boolean {
  return (
    !response.split("").some((character) => SIMPLIFIED_CHINESE_MARKERS.has(character)) &&
    !/[\u{20000}-\u{2FFFF}]/u.test(response)
  );
}

function jaccardSimilarity(a: string, b: string): number {
  if (a.length < 4 || b.length < 4) return 0;
  const toBigrams = (value: string) => {
    const set = new Set<string>();
    for (let index = 0; index < value.length - 1; index += 1) {
      set.add(value.slice(index, index + 2));
    }
    return set;
  };
  const setA = toBigrams(a);
  const setB = toBigrams(b);
  let intersection = 0;
  for (const bigram of setA) {
    if (setB.has(bigram)) intersection += 1;
  }
  return intersection / (setA.size + setB.size - intersection);
}

function hasSimilarSentences(sentences: string[]): boolean {
  for (const [index, sentence] of sentences.entries()) {
    for (const other of sentences.slice(index + 1)) {
      if (jaccardSimilarity(sentence, other) > 0.72) return true;
    }
  }
  return false;
}

function hasSubstringRepetition(text: string): boolean {
  const phrases = new Map<string, number>();
  const cleaned = text.replace(/[\s…。「」！？]/g, "");
  if (cleaned.length < 60) return false;
  for (const length of [10, 11, 12]) {
    for (let index = 0; index <= cleaned.length - length; index += 1) {
      const substring = cleaned.slice(index, index + length);
      const count = (phrases.get(substring) ?? 0) + 1;
      if (count >= 3) return true;
      phrases.set(substring, count);
    }
  }
  return false;
}

function checkWithinTurnRepetition(response: string): boolean {
  if (response.length < 60) return true;
  const sentences = response
    .split(/[\n。」！？]/)
    .map((sentence) => sentence.replace(/「/g, "").trim())
    .filter((sentence) => sentence.length > 5);
  return (
    !(sentences.length >= 4 && hasSimilarSentences(sentences)) && !hasSubstringRepetition(response)
  );
}

function splitComparablePhrases(text: string): string[] {
  return text
    .split(/[。、！？\n]/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length >= 8);
}

function countRepeatedPhrases(previousText: string, currentText: string): number {
  if (!previousText || !currentText) return 0;
  return splitComparablePhrases(previousText).filter((phrase) => currentText.includes(phrase))
    .length;
}

function checkCrossTurnRepetition(
  currentResponse: string,
  prevTexts: string[] | undefined,
): boolean {
  const previousTexts = prevTexts?.filter((text) => text.trim().length >= 20) ?? [];
  if (previousTexts.length === 0) return true;
  const currentAction = extractTag(currentResponse, "action");
  const currentDialogue = extractTag(currentResponse, "dialogue");
  const currentInner = extractTag(currentResponse, "inner");
  const repeatedCount = previousTexts
    .map(
      (previousText) =>
        countRepeatedPhrases(extractTag(previousText, "action"), currentAction) +
        countRepeatedPhrases(extractTag(previousText, "dialogue"), currentDialogue) +
        countRepeatedPhrases(extractTag(previousText, "inner"), currentInner),
    )
    .reduce((total, count) => total + count, 0);
  return repeatedCount < 1;
}

function checkConversationEscalation(plainText: string, phase: ScenePhase): boolean {
  if (phase !== "conversation") return true;
  if (AFTERGLOW_ALLOW_PATTERNS.some((pattern) => pattern.test(plainText))) return true;
  return !CONVERSATION_ESCALATION_PATTERNS.some((pattern) => pattern.test(plainText));
}

export function runServerQualityChecks(text: string, context: QualityCheckContext): QualityResult {
  const plainText = isXmlResponse(text) ? stripXmlTags(text) : text;
  const checks: [boolean, string][] = [
    [!META_REMARK_PATTERNS.some((pattern) => pattern.test(plainText)), "meta_remark"],
    [!META_PROMPT_ECHO_PATTERNS.some((pattern) => pattern.test(text)), "meta-prompt-echo"],
    [checkMultilingualLeak(text), "multilingual-leak"],
    [!/[A-Za-z]{3,}/.test(plainText), "no-english"],
    [isXmlResponse(text) && extractTag(text, "dialogue").length > 0, "xml-format-missing"],
    [!plainText.includes("ユーザー"), "user-leak"],
    [checkConversationEscalation(plainText, context.phase), "conversation-over-escalation"],
    [context.phase === "conversation" || plainText.length >= 80, "scene-min-length"],
    [checkWithinTurnRepetition(plainText), "within-turn-repetition"],
    [checkCrossTurnRepetition(text, context.prevTexts), "cross-turn-repetition"],
    [plainText.length <= 1200, "max-length-exceeded"],
    [context.phase === "conversation" || extractTag(text, "inner").length >= 5, "inner-missing"],
  ];

  for (const [passed, failedCheck] of checks) {
    if (!passed) return { passed: false, failedCheck };
  }
  return { passed: true };
}
