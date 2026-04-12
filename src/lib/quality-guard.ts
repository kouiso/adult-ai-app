// 品質ガード: LLMの確率的出力をコードで決定的に保証する
// プロンプトは「お願い」、品質ガードは「保証」

import type { ScenePhase } from "@/lib/scene-phase";
import { isXmlResponse, parseXmlResponse, stripXmlTags } from "@/lib/xml-response-parser";

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
      if (jaccardSimilarity(sentences[i], sentences[j]) > 0.6) return true;
    }
  }
  return false;
}

// 5文字以上の部分文字列が3回以上出現するか判定
function hasSubstringRepetition(text: string): boolean {
  const phrases = new Map<string, number>();
  const cleaned = text.replace(/[\s…。「」！？]/g, "");
  for (let len = 5; len <= 10; len++) {
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
  const sentences = response
    .split(/[\n。」！？]/)
    .map((s) => s.replace(/「/g, "").trim())
    .filter((s) => s.length > 5);
  if (sentences.length >= 3 && hasSimilarSentences(sentences)) return false;
  if (hasSubstringRepetition(response)) return false;
  return true;
}

// チェック5: 最大文字数（デコードループによる異常長文を検出）
// max_tokens 1024 に合わせて上限も緩和。官能シーンのクライマックスは自然に500字超える
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

// 一人称チェック（最優先 — 他のチェックより先に判定）
function checkWrongFirstPerson(
  plainText: string,
  wrongFirstPersons: string[] | undefined,
): boolean {
  if (!wrongFirstPersons || wrongFirstPersons.length === 0) return true;
  return !wrongFirstPersons.some((fp) => plainText.includes(fp));
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
    [checkNoEnglish(plainText), "no-english"],
    [checkXmlFormat(response), "xml-format-missing"],
    [checkNoUserLeak(plainText), "user-leak"],
    [checkSceneMinLength(plainText, context.phase), "scene-min-length"],
    [checkWithinTurnRepetition(plainText), "within-turn-repetition"],
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

export const MAX_QUALITY_RETRIES = 5;
