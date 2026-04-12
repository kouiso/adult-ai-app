// テストスクリプトと実機ブラウザで同一のメッセージ配列を生成するアダプター
// chat-view.tsx のクロージャ内に閉じていたロジックを純関数として切り出し、
// テストハーネスからも同じ経路で呼び出せるようにする

import type { ChatMessage } from "@/store/chat-store";

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
    (m): m is { role: "user" | "assistant"; content: string } =>
      (m.role === "user" || m.role === "assistant") && !m.isStreaming,
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

const ALL_FIRST_PERSONS = ["私", "僕", "俺", "あたし", "ワイ", "自分"] as const;

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

  return [
    ...originalMessages,
    { role: "assistant" as const, content: lastResponse },
    {
      role: "user" as const,
      content: `品質チェックに不合格でした。別の展開で書き直してください。<response>XMLフォーマットで出力すること。日本語のみ。${fpHint}`,
    },
  ];
}
