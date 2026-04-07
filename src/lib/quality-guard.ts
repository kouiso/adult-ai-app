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
}

export interface QualityCheckResult {
  passed: boolean;
  failedCheck?: string;
}

// 2文字bigram集合のmin-based類似度（スコアリング基準と統一）
function bigramSimilarity(a: string, b: string): number {
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
  return intersection / Math.min(setA.size, setB.size);
}

// チェック1: シーン応答の最低文字数
function checkSceneMinLength(response: string, phase: ScenePhase): boolean {
  if (phase === "conversation") return true;
  return response.length >= 80;
}

// チェック2: ターン間の類似度（テンプレブロック検出）
function checkCrossTurnSimilarity(
  response: string,
  prevResponse?: string,
): boolean {
  if (!prevResponse) return true;
  return bigramSimilarity(response, prevResponse) < 0.55;
}

// チェック3: 英語混入チェック
function checkNoEnglish(response: string): boolean {
  // カタカナ語（ウイスキー等）は許可するため、ラテン文字3文字以上を検出
  return !/[a-zA-Z]{3,}/.test(response);
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

// チェック4: ターン内繰り返し検出（デコードループ防止）
function checkWithinTurnRepetition(response: string): boolean {
  // 方法1: 文分割によるJaccard類似度チェック（短文の包含関係で誤検出しないようunion-based）
  const sentences = response
    .split(/[。！？\n」]/)
    .map((s) => s.replace(/[「]/g, "").trim())
    .filter((s) => s.length > 5);
  if (sentences.length >= 3) {
    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        if (jaccardSimilarity(sentences[i], sentences[j]) > 0.6) return false;
      }
    }
  }

  // 方法2: 5文字以上の部分文字列が3回以上出現したら不合格
  const phrases = new Map<string, number>();
  const cleaned = response.replace(/[…。！？「」\s]/g, "");
  for (let len = 5; len <= 10; len++) {
    for (let i = 0; i <= cleaned.length - len; i++) {
      const sub = cleaned.slice(i, i + len);
      phrases.set(sub, (phrases.get(sub) ?? 0) + 1);
      if ((phrases.get(sub) ?? 0) >= 3) return false;
    }
  }

  return true;
}

// チェック5: 最大文字数（デコードループによる異常長文を検出）
function checkMaxLength(response: string): boolean {
  return response.length <= 500;
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

// チェック7: <action>内の三人称使用検出（主語崩壊防止）
const THIRD_PERSON_PATTERNS = [
  "彼女は", "彼女の", "彼女が", "彼女を",
  "彼は", "彼の", "彼が", "彼を",
] as const;

function checkNoThirdPerson(actionText: string): boolean {
  return !THIRD_PERSON_PATTERNS.some((p) => actionText.includes(p));
}

// チェック8: <inner>セクションが存在するか（シーンフェーズでは必須）
function checkInnerExists(innerText: string, phase: ScenePhase): boolean {
  if (phase === "conversation") return true;
  return innerText.length >= 5;
}

export function runQualityChecks(
  response: string,
  context: QualityCheckContext,
): QualityCheckResult {
  // XMLパースを試行し、成功時は各セクション独立チェック
  const parsed = parseXmlResponse(response);
  // 品質チェック用のプレーンテキスト（XMLタグを除去）
  const plainText = parsed ? stripXmlTags(response) : response;

  // 一人称チェックを最優先（他のチェックより先に判定）
  if (context.wrongFirstPersons && context.wrongFirstPersons.length > 0) {
    const hasWrong = context.wrongFirstPersons.some((fp) =>
      plainText.includes(fp),
    );
    if (hasWrong) {
      return { passed: false, failedCheck: "wrong-first-person" };
    }
  }

  if (!checkNoEnglish(plainText)) {
    return { passed: false, failedCheck: "no-english" };
  }

  // XMLフォーマットチェック（全フェーズ必須）
  if (!checkXmlFormat(response)) {
    return { passed: false, failedCheck: "xml-format-missing" };
  }

  // XML固有チェック（パース成功時のみ）
  if (parsed) {
    if (parsed.action && !checkNoThirdPerson(parsed.action)) {
      return { passed: false, failedCheck: "third-person-in-action" };
    }
    if (!checkInnerExists(parsed.inner, context.phase)) {
      return { passed: false, failedCheck: "inner-missing" };
    }
  }

  // ユーザー漏れチェック（没入感破壊ワード検出）
  if (!checkNoUserLeak(plainText)) {
    return { passed: false, failedCheck: "user-leak" };
  }

  if (!checkSceneMinLength(plainText, context.phase)) {
    return { passed: false, failedCheck: "scene-min-length" };
  }

  if (!checkCrossTurnSimilarity(plainText, context.prevAssistantResponse)) {
    return { passed: false, failedCheck: "cross-turn-similarity" };
  }

  if (!checkWithinTurnRepetition(plainText)) {
    return { passed: false, failedCheck: "within-turn-repetition" };
  }

  if (!checkMaxLength(plainText)) {
    return { passed: false, failedCheck: "max-length-exceeded" };
  }

  return { passed: true };
}

export const MAX_QUALITY_RETRIES = 5;
