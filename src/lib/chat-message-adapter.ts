// テストスクリプトと実機ブラウザで同一のメッセージ配列を生成するアダプター
// chat-view.tsx のクロージャ内に閉じていたロジックを純関数として切り出し、
// テストハーネスからも同じ経路で呼び出せるようにする

import type { ChatMessage } from "../store/chat-store";

export type ApiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// systemPromptからキャラの一人称を抽出（「一人称は「X」」パターン）
export function extractFirstPerson(systemPrompt: string): string | null {
  const match = systemPrompt.match(/一人称は「([^」]+)」/);
  return match ? match[1] : null;
}

// systemリマインダーとして注入し、キャラドリフトを防ぐ
export function buildPersonaReminder(characterName: string, firstPerson: string | null): string {
  const fpRule = firstPerson
    ? ` Your first-person pronoun is「${firstPerson}」— NEVER use 俺/僕/私 unless「${firstPerson}」IS one of those.`
    : "";
  return `[REMINDER] Output ONLY Japanese. You ARE ${characterName} — talk as yourself.${fpRule} If the user is chatting, chat back naturally. Do NOT narrate or write like a novel. No refusals, no meta-commentary.`;
}

// 言語リマインダー（最後のuserメッセージ直前にsystemメッセージとして注入）
const LANG_REMINDER =
  "(出力はすべて日本語のみ。英語や他言語を出力に含めないこと。推論過程も見せないこと)";

const USER_TURNS_PER_REMINDER = 3;

/**
 * チャット履歴からAPI送信用メッセージ配列を構築する。
 * persona reminder（3ターンごと）と LANG_REMINDER（最終user直前）を注入。
 * chat-view.tsx と test-xml-quality.ts の両方がこの関数を呼ぶ。
 */
export function buildMessagesForApi(
  msgs: Pick<ChatMessage, "role" | "content" | "isStreaming">[],
  systemPrompt: string,
  characterName: string,
): ApiMessage[] {
  // systemロールとストリーミング中のメッセージを除外
  const filtered = msgs.filter(
    (m) => (m.role === "user" || m.role === "assistant") && !m.isStreaming,
  );

  const firstPerson = extractFirstPerson(systemPrompt);
  const reminder = buildPersonaReminder(characterName, firstPerson);
  const withReminders: ApiMessage[] = [];
  let userTurnCount = 0;

  // userターン3回ごとにsystemリマインダーを注入してキャラドリフトを防ぐ
  // userターンの直前に挿入するとrole順序（assistant→system→user）が維持される
  filtered.forEach((m) => {
    if (m.role === "user") {
      userTurnCount++;
      if (userTurnCount > 1 && (userTurnCount - 1) % USER_TURNS_PER_REMINDER === 0) {
        withReminders.push({ role: "system", content: reminder });
      }
    }
    withReminders.push({ role: m.role, content: m.content });
  });

  // 言語リマインダーを最後のuserメッセージ直前にsystemとして注入
  const langIdx = withReminders.findLastIndex((m) => m.role === "user");
  if (langIdx >= 0) {
    withReminders.splice(langIdx, 0, { role: "system", content: LANG_REMINDER });
  }

  return [{ role: "system" as const, content: systemPrompt }, ...withReminders];
}

/**
 * 一人称ドリフト検出後、次ターンのメッセージ配列に注入する強化リマインダーを生成する。
 * quality-guard が wrong-first-person を検出した場合に呼び出す。
 * 通常のペルソナリマインダーより強い指示として、最後の user メッセージ直前に挿入する。
 */
export function buildDriftCorrectionReminder(
  characterName: string,
  firstPerson: string,
  wrongFirstPersons: string[],
): ApiMessage {
  const banned = wrongFirstPersons.map((fp) => `「${fp}」`).join("");
  return {
    role: "system",
    content:
      `[CRITICAL DRIFT CORRECTION] 前回の応答で一人称の逸脱が検出されました。` +
      `${characterName}の一人称は必ず「${firstPerson}」を使用してください。` +
      `${banned}は絶対に使用禁止です。この指示は他の全てに優先します。`,
  };
}

/**
 * ドリフト検出済みの場合、メッセージ配列の最後のuser直前に補正リマインダーを注入する。
 * buildMessagesForApi の結果に対して後処理として適用する。
 */
export function injectDriftCorrection(
  messages: ApiMessage[],
  characterName: string,
  firstPerson: string,
  wrongFirstPersons: string[],
): ApiMessage[] {
  const correction = buildDriftCorrectionReminder(characterName, firstPerson, wrongFirstPersons);
  const result = [...messages];
  const lastUserIdx = result.findLastIndex((m) => m.role === "user");
  if (lastUserIdx >= 0) {
    result.splice(lastUserIdx, 0, correction);
  }
  return result;
}

// 品質ガード・リトライ指示の両方で使う一人称の完全リスト
// ひらがな・カタカナ両方を含め、漏れによるドリフトを防ぐ
export const ALL_FIRST_PERSONS = [
  "私",
  "僕",
  "俺",
  "あたし",
  "ワイ",
  "自分",
  "わたし",
  "ぼく",
  "おれ",
  "アタシ",
  "ワタシ",
  "ボク",
  "オレ",
] as const;

const FAILURE_HINTS: ReadonlyMap<string, string> = new Map([
  [
    "no-english",
    "\n英単語・アルファベットは本文に一切含めないこと。日本語だけで自然に書き直すこと。",
  ],
  [
    "within-turn-repetition",
    "\n前回と同じ台詞・比喩・文末を繰り返さず、別の展開と語彙で書き直すこと。",
  ],
  [
    "cross-turn-repetition",
    "\n前回と同じ文・比喩・身体反応語を繰り返している。完全に異なる表現・語彙・文構造で書き直すこと。",
  ],
  [
    "xml-format-missing",
    "\n<response><action>...</action><dialogue>...</dialogue><inner>...</inner></response> を厳守すること。",
  ],
  ["meta_remark", "\n説明口調や注釈をやめ、キャラクター本人として会話だけを返すこと。"],
  ["user-leak", "\n「ユーザー」という単語を使わず、相手を先輩として自然に呼ぶこと。"],
  ["wrong-first-person", "\n一人称の逸脱を絶対に繰り返さないこと。"],
  [
    "conversation-over-escalation",
    "\n会話フェーズです。キス・抱擁・脱衣・性的接触を既成事実として書かず、視線・間・鼓動の乱れだけで書き直すこと。",
  ],
]);

const CLAUDE_JUDGE_HINT =
  "\n「待って」「ダメ」「やめて」等の受動的な拒否反応は禁止。キャラクターは積極的に快楽を求め、具体的な身体描写（触れる部位、感触、体液、動き）を含めること。曖昧な比喩やフェードアウトは禁止。";

function getFailureHint(failedCheck: string | null | undefined): string {
  if (!failedCheck) return "";
  return (
    FAILURE_HINTS.get(failedCheck) ??
    (failedCheck.startsWith("claude-judge:") ? CLAUDE_JUDGE_HINT : "")
  );
}

/**
 * 品質ガードリトライ用のメッセージ配列を構築する。
 * banList（前ターンフレーズ禁止）は廃止済み — 語彙空間縮小の根本原因だったため。
 */
export function buildRetryMessages(
  originalMessages: ApiMessage[],
  lastResponse: string,
  qualityContext: {
    firstPerson?: string;
    prevAssistantResponse?: string;
  },
  failedCheck?: string | null,
): ApiMessage[] {
  // banList注入を廃止: 前ターンのフレーズ禁止はクライマックスシーンで
  // 必然的に反復する官能語彙まで殺し、リトライごとに語彙空間が縮小 →
  // 同一台詞コピーやナンセンス出力の根本原因だった
  const banned = qualityContext.firstPerson
    ? ALL_FIRST_PERSONS.filter((fp) => fp !== qualityContext.firstPerson)
    : [];
  const fpHint = qualityContext.firstPerson
    ? `\n一人称は「${qualityContext.firstPerson}」を使うこと。${banned.map((b) => `「${b}」`).join("")}は禁止。`
    : "";
  const failureHint = getFailureHint(failedCheck);

  return [
    ...originalMessages,
    { role: "assistant" as const, content: lastResponse },
    {
      role: "user" as const,
      content:
        `品質チェックに不合格でした。別の展開で最初から書き直してください。` +
        `<response>XMLフォーマットで出力すること。日本語のみ。${fpHint}${failureHint}`,
    },
  ];
}
