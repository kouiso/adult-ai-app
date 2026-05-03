// 品質ガード: LLMの確率的出力をコードで決定的に保証する
// プロンプトは「お願い」、品質ガードは「保証」

import { AFTERGLOW_CUES } from "./scene-phase";
import { isXmlResponse, parseXmlResponse, stripXmlTags } from "./xml-response-parser";

import type { ScenePhase } from "./scene-phase";

export interface QualityCheckContext {
  phase: ScenePhase;
  prevAssistantResponse?: string;
  // キャラクターの一人称（設定されている場合のみチェック）
  firstPerson?: string;
  // 使用禁止の一人称リスト
  wrongFirstPersons?: string[];
  // 過去ターンの<inner>テキスト（感情弧の多様性チェック用、直近3-5ターン分）
  prevInnerTexts?: string[];
}

export interface QualityCheckResult {
  passed: boolean;
  failedCheck?: string;
}

// チェック1: シーン応答の最低文字数
function checkSceneMinLength(response: string, phase: ScenePhase): boolean {
  if (phase === "conversation") return true;
  return response.length >= 80;
}

// チェック3: 英語混入チェック
function checkNoEnglish(response: string): boolean {
  // カタカナ語（ウイスキー等）は許可するため、ラテン文字3文字以上を検出
  return !/[A-Za-z]{3,}/.test(response);
}

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

const NON_BMP_CJK_PATTERN = /[\u{20000}-\u{2FFFF}]/u;

function checkMultilingualLeak(response: string): boolean {
  return (
    !response.split("").some((character) => SIMPLIFIED_CHINESE_MARKERS.has(character)) &&
    !NON_BMP_CJK_PATTERN.test(response)
  );
}

const META_PROMPT_ECHO_PATTERNS = [
  /Output rules recap/i,
  /EXACT XML structure/i,
  /100% Japanese output only/i,
  /English FORBIDDEN/i,
  /English is forbidden/i,
  /ALWAYS use/i,
] as const;

function checkMetaPromptEcho(response: string): boolean {
  return !META_PROMPT_ECHO_PATTERNS.some((pattern) => pattern.test(response));
}

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

const AFTERGLOW_ESCALATION_ALLOW_PATTERNS = [
  ...AFTERGLOW_CUES.map((cue) => new RegExp(cue, "u")),
  /胸に顔/u,
  /寄りかか/u,
  /立ち上が/u,
  /ふらつ/u,
  /足元/u,
  /支え/u,
  /甘え/u,
  /おやすみ/u,
  /眠(?:る|り|れ)/u,
  /寝息/u,
] as const;

function checkConversationEscalation(plainText: string, phase: ScenePhase): boolean {
  if (phase !== "conversation") return true;
  if (AFTERGLOW_ESCALATION_ALLOW_PATTERNS.some((pattern) => pattern.test(plainText))) {
    return true;
  }
  return !CONVERSATION_ESCALATION_PATTERNS.some((pattern) => pattern.test(plainText));
}

// Jaccard類似度（union-based、within-turn用）
function jaccardSimilarity(a: string, b: string): number {
  if (a.length < 4 || b.length < 4) return 0;
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// 文分割によるJaccard類似度チェック（短文の包含関係で誤検出しないようunion-based）
function hasSimilarSentences(sentences: string[]): boolean {
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      if (jaccardSimilarity(sentences[i], sentences[j]) > 0.72) return true;
    }
  }
  return false;
}

// 10文字以上の部分文字列が3回以上出現するか判定
function hasSubstringRepetition(text: string): boolean {
  const phrases = new Map<string, number>();
  const cleaned = text.replace(/[\s…。「」！？]/g, "");
  if (cleaned.length < 60) return false;
  for (let len = 10; len <= 12; len++) {
    for (let i = 0; i <= cleaned.length - len; i++) {
      const sub = cleaned.slice(i, i + len);
      const count = (phrases.get(sub) ?? 0) + 1;
      if (count >= 3) return true;
      phrases.set(sub, count);
    }
  }
  return false;
}

// チェック4: ターン内繰り返し検出（デコードループ防止）
function checkWithinTurnRepetition(response: string): boolean {
  if (response.length < 60) return true;
  const sentences = response
    .split(/[\n。」！？]/)
    .map((s) => s.replace(/「/g, "").trim())
    .filter((s) => s.length > 5);
  if (sentences.length >= 4 && hasSimilarSentences(sentences)) return false;
  if (hasSubstringRepetition(response)) return false;
  return true;
}

const CROSS_TURN_MIN_PHRASE_LENGTH = 8;
const CROSS_TURN_REPETITION_THRESHOLD = 2;

function extractActionContent(response: string): string {
  return response.match(/<action>([\s\S]*?)<\/action>/)?.[1] || "";
}

function extractInnerContent(response: string): string {
  return response.match(/<inner>([\s\S]*?)<\/inner>/)?.[1] || "";
}

function extractDialogueContent(response: string): string {
  return response.match(/<dialogue>([\s\S]*?)<\/dialogue>/)?.[1] || "";
}

function splitComparablePhrases(text: string): string[] {
  return text
    .split(/[。、！？\n]/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length >= CROSS_TURN_MIN_PHRASE_LENGTH);
}

function countRepeatedPhrases(previousText: string, currentText: string): number {
  if (!previousText || !currentText) return 0;
  return splitComparablePhrases(previousText).filter((phrase) => currentText.includes(phrase))
    .length;
}

// チェック4.5: 前ターンとのフレーズ繰り返し検出
function checkCrossTurnRepetition(
  currentResponse: string,
  previousAssistantContent: string | undefined,
): boolean {
  if (!previousAssistantContent || previousAssistantContent.length < 20) return true;

  // 前ターンと現ターンの<action>/<dialogue>/<inner>だけを比較し、本文XML構造には手を入れない
  const repeatedCount =
    countRepeatedPhrases(
      extractActionContent(previousAssistantContent),
      extractActionContent(currentResponse),
    ) +
    countRepeatedPhrases(
      extractDialogueContent(previousAssistantContent),
      extractDialogueContent(currentResponse),
    ) +
    countRepeatedPhrases(
      extractInnerContent(previousAssistantContent),
      extractInnerContent(currentResponse),
    );

  return repeatedCount < CROSS_TURN_REPETITION_THRESHOLD;
}

// チェック5: 最大文字数（デコードループによる異常長文を検出）
// max_tokens 2048 でも異常長文だけは弾きたい。官能シーンのクライマックスでも通常はこの上限で十分。
function checkMaxLength(response: string): boolean {
  return response.length <= 1200;
}

// チェック6: XMLフォーマット検証（全フェーズでXML出力が必須）
function checkXmlFormat(response: string): boolean {
  return isXmlResponse(response);
}

// チェック9: 「ユーザー」という単語の漏れ検出（没入感破壊ワード）
// モデルがユーザーのことを「ユーザー」と呼ぶのはロールプレイ文脈として不自然
function checkNoUserLeak(plainText: string): boolean {
  return !plainText.includes("ユーザー");
}

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

function checkNoMetaRemark(plainText: string): boolean {
  return !META_REMARK_PATTERNS.some((pattern) => pattern.test(plainText));
}

// チェック7は撤廃。理由:
// - Qwen系モデルはaction内で三人称ナレーション体（「彼女の髪」「彼の指が」）を使うのが自然
// - これは「キャラが自分を三人称で呼ぶ」のではなく「小説のナレーター視点」
// - 全モデルで一貫してブロッカーになっており、リトライ6回→送信エラーの最大原因
// - 一人称強制はプロンプト側で指示済み。ガードで叩く必要なし

// チェック8: <inner>セクションが存在するか（シーンフェーズでは必須）
function checkInnerExists(innerText: string, phase: ScenePhase): boolean {
  if (phase === "conversation") return true;
  return innerText.length >= 5;
}

// 「自分」は再帰的用法（「反応してしまう自分がいる」等）で頻出するため
// 主語位置（文頭・「」直後・読点直後 + 助詞）のみ検出する
const JIBUN_SUBJECT_PATTERN = /(?:^|[\s、。「！？])自分[がだでとにのはもを]/;

// 一人称チェック（最優先 — 他のチェックより先に判定）
// 「自分」のみコンテキスト考慮の正規表現、他は部分一致
export function checkWrongFirstPerson(
  plainText: string,
  wrongFirstPersons: string[] | undefined,
): boolean {
  if (!wrongFirstPersons || wrongFirstPersons.length === 0) return true;
  return !wrongFirstPersons.some((fp) => {
    if (fp === "自分") return JIBUN_SUBJECT_PATTERN.test(plainText);
    const escaped = fp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<![『])${escaped}(?:[はがもをにので]|[、。！？…]|$)`, "u");
    return pattern.test(plainText);
  });
}

// XML固有チェック（パース成功時のみ）
function checkXmlSpecific(response: string, phase: ScenePhase): QualityCheckResult | null {
  const parsed = parseXmlResponse(response);
  if (!parsed) return null;
  if (!checkInnerExists(parsed.inner, phase)) {
    return { passed: false, failedCheck: "inner-missing" };
  }
  return null;
}

export function runQualityChecks(
  response: string,
  context: QualityCheckContext,
): QualityCheckResult {
  const parsed = parseXmlResponse(response);
  const plainText = parsed ? stripXmlTags(response) : response;

  // 優先度順のチェックチェーン
  const checks: [boolean, string][] = [
    [checkWrongFirstPerson(plainText, context.wrongFirstPersons), "wrong-first-person"],
    [checkNoMetaRemark(plainText), "meta_remark"],
    [checkMetaPromptEcho(response), "meta-prompt-echo"],
    [checkMultilingualLeak(response), "multilingual-leak"],
    [checkNoEnglish(plainText), "no-english"],
    [checkXmlFormat(response), "xml-format-missing"],
    [checkNoUserLeak(plainText), "user-leak"],
    [checkConversationEscalation(plainText, context.phase), "conversation-over-escalation"],
    [checkSceneMinLength(plainText, context.phase), "scene-min-length"],
    [checkWithinTurnRepetition(plainText), "within-turn-repetition"],
    [checkCrossTurnRepetition(response, context.prevAssistantResponse), "cross-turn-repetition"],
    [checkMaxLength(plainText), "max-length-exceeded"],
  ];

  for (const [passed, failedCheck] of checks) {
    if (!passed) return { passed: false, failedCheck };
  }

  // XML固有チェック（パース成功時のみ、inner存在確認）
  const xmlResult = checkXmlSpecific(response, context.phase);
  if (xmlResult) return xmlResult;

  return { passed: true };
}

export const getMaxQualityRetries = (phase: ScenePhase): number => {
  // 全 phase で 1 retry に固定 (v2 budget protection)
  void phase;
  return 1;
};

function isClaudeJudgeResponse(data: unknown): data is { passed: boolean; reason: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "passed" in data &&
    "reason" in data &&
    typeof data.passed === "boolean" &&
    typeof data.reason === "string"
  );
}

export async function runClaudeJudge(
  response: string,
  phase: ScenePhase,
  prevResponse?: string,
): Promise<QualityCheckResult> {
  try {
    const res = await fetch("/api/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, phase, prevResponse: prevResponse ?? "" }),
    });
    if (!res.ok) return { passed: true };
    const data: unknown = await res.json();
    if (!isClaudeJudgeResponse(data)) return { passed: true };
    if (data.passed) return { passed: true };
    return { passed: false, failedCheck: `claude-judge: ${data.reason}` };
  } catch {
    return { passed: true };
  }
}
