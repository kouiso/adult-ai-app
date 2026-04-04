import { z } from "zod/v4";

const REPETITION_CHECK_WINDOW = 500;
const EXACT_REPETITION = /(.{3,30})\1{3,}/;
const FREQ_THRESHOLD = 4;

// フレーズ配列の中に閾値以上の頻出がないか判定
function hasFrequentItem(items: string[], threshold: number): boolean {
  const freq = new Map<string, number>();
  for (const item of items) {
    const count = (freq.get(item) ?? 0) + 1;
    if (count >= threshold) return true;
    freq.set(item, count);
  }
  return false;
}

// 2文字bigram集合のJaccard類似度で近似的な繰り返しを検出する
function bigramSimilarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
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

// フレーズ群の中に類似度0.6以上のペアが閾値回以上あるか判定
function findSimilarGroup(groups: string[][], phrase: string): string[] | null {
  for (const group of groups) {
    if (bigramSimilarity(phrase, group[0]) >= 0.6) return group;
  }
  return null;
}

function hasSimilarRepetition(phrases: string[], threshold: number): boolean {
  const groups: string[][] = [];
  for (const phrase of phrases) {
    const group = findSimilarGroup(groups, phrase);
    if (group) {
      group.push(phrase);
      if (group.length >= threshold) return true;
    } else {
      groups.push([phrase]);
    }
  }
  return false;
}

function detectRepetition(text: string): boolean {
  if (text.length < 50) return false;
  const tail = text.slice(-REPETITION_CHECK_WINDOW);

  if (EXACT_REPETITION.test(tail)) return true;

  // 「」で囲まれたセリフの頻出検出
  const quotes = tail.match(/「[^」]{2,30}」/g);
  if (quotes && quotes.length >= 6 && hasFrequentItem(quotes, FREQ_THRESHOLD)) return true;

  // 句読点・スペース区切りフレーズの頻出検出
  // スペース区切りの短フレーズ繰り返し（「もう死にそう おかしくなりそう」等）も検出する
  const phrases = tail.split(/[\n…。！？\s　]+/).filter((p) => p.length >= 3 && p.length <= 30);
  if (phrases.length >= 6 && hasFrequentItem(phrases, FREQ_THRESHOLD)) return true;

  // N-gram類似度による近似繰り返し検出
  if (phrases.length >= 6 && hasSimilarRepetition(phrases, FREQ_THRESHOLD)) return true;

  // スライディングウィンドウによる部分文字列繰り返し検出
  // 10〜40文字の部分文字列が3回以上出現したらループとみなす
  if (tail.length >= 60) {
    for (const windowSize of [15, 25, 40]) {
      const seen = new Map<string, number>();
      for (let i = 0; i <= tail.length - windowSize; i += 5) {
        const chunk = tail.slice(i, i + windowSize);
        const count = (seen.get(chunk) ?? 0) + 1;
        if (count >= 3) return true;
        seen.set(chunk, count);
      }
    }
  }

  return false;
}

function parseSseChunk(data: string): string | "[DONE]" | null {
  if (data === "[DONE]") return "[DONE]";
  try {
    const parsed: { choices?: Array<{ delta?: { content?: string } }> } = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    // SSEストリームでの不完全なJSONチャンクは正常の範囲なので次へ進む
    return null;
  }
}

// UIの再レンダーを間引くため、チャンクをバッファして一定間隔でフラッシュする
const STREAM_FLUSH_INTERVAL_MS = 50;

type SseLineResult = "done" | "repetition" | "continue";

function processSseLine(
  line: string,
  state: { accumulated: string; pendingChunks: string },
): SseLineResult {
  if (!line.startsWith("data: ")) return "continue";
  const result = parseSseChunk(line.slice(6).trim());
  if (result === "[DONE]") return "done";
  if (!result) return "continue";

  state.accumulated += result;
  state.pendingChunks += result;

  if (detectRepetition(state.accumulated)) return "repetition";
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
  const state = { accumulated: "", pendingChunks: "" };
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
      if (lineResult === "repetition") {
        cleanup();
        await reader.cancel();
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
): Promise<{ task_id: string } | { error: string }> {
  try {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        characterDescription: characterDescription ?? "",
        negative_prompt: "ugly, deformed, blurry, low quality, text, watermark",
        width: 512,
        height: 768,
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
