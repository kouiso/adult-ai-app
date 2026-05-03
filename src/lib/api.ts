import { z } from "zod/v4";

import type { QualityCheckContext } from "@/lib/quality-guard";
import type { ScenePhase } from "@/lib/scene-phase";

function parseSseChunk(data: string): string | "[DONE]" | null {
  if (data === "[DONE]") return "[DONE]";
  try {
    const parsed: { choices?: Array<{ delta?: { content?: string } }> } = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch (error) {
    // SSEストリームでの不完全なJSONチャンクは正常の範囲なので次へ進む
    console.error("failed to parse SSE chunk", error);
    return null;
  }
}

// UIの再レンダーを間引くため、チャンクをバッファして一定間隔でフラッシュする
const STREAM_FLUSH_INTERVAL_MS = 50;

type SseLineResult = "done" | "continue";

function processSseLine(line: string, state: { pendingChunks: string }): SseLineResult {
  if (!line.startsWith("data: ")) return "continue";
  const result = parseSseChunk(line.slice(6).trim());
  if (result === "[DONE]") return "done";
  if (!result) return "continue";

  state.pendingChunks += result;
  return "continue";
}

async function processStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = { pendingChunks: "" };
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (state.pendingChunks) {
      onChunk(state.pendingChunks);
      state.pendingChunks = "";
    }
    flushTimer = null;
  };

  const cleanup = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flush();
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const lineResult = processSseLine(line, state);
      if (lineResult === "done") {
        cleanup();
        onDone();
        return;
      }
      if (lineResult === "continue" && state.pendingChunks && !flushTimer) {
        flushTimer = setTimeout(flush, STREAM_FLUSH_INTERVAL_MS);
      }
    }
  }
  cleanup();
  onDone();
}

export async function streamChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model }),
    });

    if (!response.ok || !response.body) {
      onError(await response.text());
      return;
    }

    await processStream(response.body, onChunk, onDone);
  } catch (err) {
    console.error("streamChat failed", err);
    onError(String(err));
  }
}

export interface ChatStreamResult {
  content: string;
  warningLevel?: boolean;
}

export async function streamChatWithQualityGuard(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
  onChunk: (text: string) => void,
  onDone: (result: ChatStreamResult) => void,
  onError: (error: string) => void,
  qualityContext: QualityCheckContext,
): Promise<void> {
  void qualityContext;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model }),
    });

    if (!response.ok || !response.body) {
      onError(await response.text());
      return;
    }

    const warningLevel = response.headers.get("x-quality-warning") === "1";
    let accumulated = "";
    await processStream(
      response.body,
      (chunk) => {
        accumulated += chunk;
        onChunk(chunk);
      },
      () => onDone({ content: accumulated, warningLevel }),
    );
  } catch (err) {
    console.error("streamChatWithQualityGuard failed", err);
    onError(String(err));
  }
}

const generateImageResponseSchema = z.union([
  z.object({ task_id: z.string() }),
  z.object({ error: z.string() }),
]);

export async function generateImage(
  prompt: string,
  characterDescription?: string,
  phase?: ScenePhase,
): Promise<{ task_id: string } | { error: string }> {
  try {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        characterDescription: characterDescription ?? "",
        negative_prompt: "ugly, deformed, blurry, low quality, text, watermark",
        width: 768,
        height: 1024,
        phase: phase ?? "conversation",
      }),
    });
    if (!response.ok) {
      return { error: await response.text() };
    }
    return generateImageResponseSchema.parse(await response.json());
  } catch (err) {
    return { error: String(err) };
  }
}

const novitaTaskResultSchema = z
  .object({
    task: z.object({
      task_id: z.string(),
      status: z.enum([
        "TASK_STATUS_QUEUED",
        "TASK_STATUS_PROCESSING",
        "TASK_STATUS_SUCCEED",
        "TASK_STATUS_FAILED",
        "TASK_STATUS_CANCELED",
      ]),
      progress_percent: z.number(),
    }),
    images: z.array(z.object({ image_url: z.string() }).passthrough()).optional(),
  })
  .passthrough();

type NovitaTaskResult = z.infer<typeof novitaTaskResultSchema>;

export async function getImageTaskResult(taskId: string): Promise<NovitaTaskResult> {
  const response = await fetch(`/api/image/task/${encodeURIComponent(taskId)}`);
  if (!response.ok) {
    throw new Error(`task result fetch failed: ${response.status}`);
  }
  return novitaTaskResultSchema.parse(await response.json());
}

// ── 会話 ──────────────────────────────────────────────────────────────────

const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  characterId: z.string(),
  characterName: z.string(),
  characterGreeting: z.string(),
  characterSystemPrompt: z.string(),
  characterAvatar: z.string().nullable(),
});

const listConversationsSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});

const createConversationSchema = z.object({
  conversation: conversationSummarySchema,
});

const persistedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  imageUrl: z.string().nullable().optional(),
  imageKey: z.string().nullable().optional(),
  createdAt: z.number(),
});

const listMessagesSchema = z.object({
  messages: z.array(persistedMessageSchema),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type PersistedMessage = z.infer<typeof persistedMessageSchema>;

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch("/api/conversations");
  if (!response.ok) {
    throw new Error(`list conversations failed: ${response.status}`);
  }
  return listConversationsSchema.parse(await response.json()).conversations;
}

export async function createConversation(input?: {
  title?: string;
  characterId?: string;
}): Promise<ConversationSummary> {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: input?.title, characterId: input?.characterId }),
  });
  if (!response.ok) {
    throw new Error(`create conversation failed: ${response.status}`);
  }
  return createConversationSchema.parse(await response.json()).conversation;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`delete conversation failed: ${response.status}`);
  }
}

export async function deleteAllConversations(): Promise<void> {
  const response = await fetch("/api/conversations", {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`delete all conversations failed: ${response.status}`);
  }
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(`update conversation title failed: ${response.status}`);
  }
}

export async function updateConversationCharacter(
  conversationId: string,
  characterId: string,
): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/character`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId }),
    },
  );
  if (!response.ok) {
    throw new Error(`update conversation character failed: ${response.status}`);
  }
}

export async function generateConversationTitle(
  conversationId: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
): Promise<string | null> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/generate-title`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model }),
    },
  );
  if (!response.ok) return null;
  const data: { title?: string } = await response.json();
  return data.title ?? null;
}

export async function listConversationMessages(
  conversationId: string,
): Promise<PersistedMessage[]> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
  if (!response.ok) {
    throw new Error(`list messages failed: ${response.status}`);
  }
  return listMessagesSchema.parse(await response.json()).messages;
}

export async function createConversationMessage(input: {
  conversationId: string;
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  imageUrl?: string;
  imageKey?: string;
}): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        role: input.role,
        content: input.content,
        imageUrl: input.imageUrl,
        imageKey: input.imageKey,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`create message failed: ${response.status}`);
  }
}

export async function deleteMessagesAfterMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages-after/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`delete messages after failed: ${response.status}`);
  }
}

export async function updateMessageImage(input: {
  messageId: string;
  imageUrl?: string;
  imageKey?: string;
}): Promise<void> {
  const response = await fetch(`/api/messages/${encodeURIComponent(input.messageId)}/image`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: input.imageUrl,
      imageKey: input.imageKey,
    }),
  });
  if (!response.ok) {
    throw new Error(`update message image failed: ${response.status}`);
  }
}

const persistImageToR2ResponseSchema = z.union([
  z.object({ imageKey: z.string() }),
  z.object({ error: z.string() }),
]);

// エフェメラルなS3 URLをR2に永続化し、imageKeyを返す
export async function persistImageToR2(
  imageUrl: string,
  messageId: string,
): Promise<{ imageKey: string } | { error: string }> {
  const response = await fetch("/api/image/persist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, messageId }),
  });
  if (!response.ok) {
    return { error: `R2 persist failed: ${response.status}` };
  }
  return persistImageToR2ResponseSchema.parse(await response.json());
}

export async function updateMessageContent(messageId: string, content: string): Promise<void> {
  const response = await fetch(`/api/messages/${encodeURIComponent(messageId)}/content`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error(`update message content failed: ${response.status}`);
  }
}

// ── キャラクター ──────────────────────────────────────────────────────────

const characterSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
  systemPrompt: z.string(),
  greeting: z.string(),
  tags: z.array(z.string()),
  createdAt: z.number(),
});

const listCharactersSchema = z.object({
  characters: z.array(characterSchema),
});

const createCharacterResponseSchema = z.object({
  character: characterSchema,
});

export type Character = z.infer<typeof characterSchema>;

export type CharacterInput = {
  name: string;
  avatar?: string;
  systemPrompt: string;
  greeting: string;
  tags: string[];
};

export async function listCharacters(): Promise<Character[]> {
  const response = await fetch("/api/characters");
  if (!response.ok) {
    throw new Error(`list characters failed: ${response.status}`);
  }
  return listCharactersSchema.parse(await response.json()).characters;
}

export async function createCharacter(input: CharacterInput): Promise<Character> {
  const response = await fetch("/api/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`create character failed: ${response.status}`);
  }
  return createCharacterResponseSchema.parse(await response.json()).character;
}

export async function updateCharacter(id: string, input: CharacterInput): Promise<void> {
  const response = await fetch(`/api/characters/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`update character failed: ${response.status}`);
  }
}

export async function deleteCharacter(id: string): Promise<void> {
  const response = await fetch(`/api/characters/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`delete character failed: ${response.status}`);
  }
}
