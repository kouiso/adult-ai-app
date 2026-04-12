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

// チェック4: ターン内繰り返し検出（デコードループ防止）
function checkWithinTurnRepetition(response: string): boolean {
  // 方法1: 文分割によるJaccard類似度チェック（短文の包含関係で誤検出しないようunion-based）
  const sentences = response
    .split(/[\n。」！？]/)
    .map((s) => s.replace(/「/g, "").trim())
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
  const cleaned = response.replace(/[\s…。「」！？]/g, "");
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
    const hasWrong = context.wrongFirstPersons.some((fp) => plainText.includes(fp));
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
    // third-person チェックは撤廃済み（ナレーション体として自然な表現まで誤ブロックするため）
    if (!checkInnerExists(parsed.inner, context.phase)) {
      return { passed: false, failedCheck: "inner-missing" };
    }
    // inner多様性チェックは削除 — サンプラに委任（理由はクロスターン削除と同じ）
  }

  // ユーザー漏れチェック（没入感破壊ワード検出）
  if (!checkNoUserLeak(plainText)) {
    return { passed: false, failedCheck: "user-leak" };
  }

  if (!checkSceneMinLength(plainText, context.phase)) {
    return { passed: false, failedCheck: "scene-min-length" };
  }

  // クロスターン類似度・フレーズ重複チェックは削除
  // 理由: 官能シーンは語彙が自然に収束する領域（「胸」「喘ぎ」等）で、
  // ターン間重複rejectがリトライ地獄→同一台詞コピーの根本原因だった
  // 反復制御はサンプラ (repetition_penalty 1.05) に委任する

  if (!checkWithinTurnRepetition(plainText)) {
    return { passed: false, failedCheck: "within-turn-repetition" };
  }

  if (!checkMaxLength(plainText)) {
    return { passed: false, failedCheck: "max-length-exceeded" };
  }

  return { passed: true };
}

export const MAX_QUALITY_RETRIES = 5;
