import { z } from "zod/v4";

const REPETITION_CHECK_WINDOW = 500;
const EXACT_REPETITION = /(.{5,30})\1{4,}/;
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

// スライディングウィンドウで部分文字列の繰り返しを検出
function hasSlidingWindowRepetition(
  tail: string,
  windowSizes: number[],
  step: number,
  threshold: number,
): boolean {
  for (const windowSize of windowSizes) {
    if (tail.length < windowSize * 2) continue;
    const seen = new Map<string, number>();
    for (let i = 0; i <= tail.length - windowSize; i += step) {
      const chunk = tail.slice(i, i + windowSize);
      const count = (seen.get(chunk) ?? 0) + 1;
      if (count >= threshold) return true;
      seen.set(chunk, count);
    }
  }
  return false;
}

// フレーズベースの繰り返し検出（セリフ・句読点区切り・N-gram類似度）
function hasPhraseRepetition(tail: string): boolean {
  const quotes = tail.match(/「[^」]{2,30}」/g);
  if (quotes && quotes.length >= 6 && hasFrequentItem(quotes, FREQ_THRESHOLD)) return true;

  // スペース区切りの短フレーズ繰り返し（「もう死にそう おかしくなりそう」等）も検出
  const phrases = tail.split(/[\s…。！？]+/).filter((p) => p.length >= 3 && p.length <= 30);
  if (phrases.length >= 6 && hasFrequentItem(phrases, FREQ_THRESHOLD)) return true;
  if (phrases.length >= 6 && hasSimilarRepetition(phrases, FREQ_THRESHOLD)) return true;

  return false;
}

function detectRepetition(text: string): boolean {
  if (text.length < 50) return false;
  const tail = text.slice(-REPETITION_CHECK_WINDOW);

  if (EXACT_REPETITION.test(tail)) return true;
  if (hasPhraseRepetition(tail)) return true;

  if (tail.length < 60) return false;
  // 短いパターン(15-40文字): 4回以上で検出
  if (hasSlidingWindowRepetition(tail, [15, 25, 40], 5, 4)) return true;
  // 長いパターン(60-80文字): 2回以上で検出（テンプレブロックの繰り返し）
  if (hasSlidingWindowRepetition(tail, [60, 80], 10, 2)) return true;

  return false;
}

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
    console.error("streamChat failed", err);
    onError(String(err));
  }
}

// 品質ガード付きストリーミング
// 応答完了後に品質チェックを行い、不合格なら自動再生成する
import { buildRetryMessages } from "@/lib/chat-message-adapter";
import type { QualityCheckContext, QualityCheckResult } from "@/lib/quality-guard";
import { getMaxQualityRetries, runQualityChecks } from "@/lib/quality-guard";
import type { ScenePhase } from "@/lib/scene-phase";
import { isXmlResponse, stripXmlTags, wrapConversationPlainAsXml } from "@/lib/xml-response-parser";

export interface ChatStreamResult {
  content: string;
  warningLevel?: boolean;
}

const E2E_STRICT_QUALITY_STORAGE_KEY = "e2e-strict-quality";
const E2E_STRICT_MAX_QUALITY_RETRIES = 2;

function isE2eStrictQualityMode(): boolean {
  const storage = (
    globalThis as {
      localStorage?: Pick<Storage, "getItem">;
    }
  ).localStorage;
  return storage?.getItem(E2E_STRICT_QUALITY_STORAGE_KEY) === "1";
}

function getEffectiveMaxQualityRetries(phase: ScenePhase): number {
  const baseRetries = getMaxQualityRetries(phase);
  return isE2eStrictQualityMode()
    ? Math.max(baseRetries, E2E_STRICT_MAX_QUALITY_RETRIES)
    : baseRetries;
}

// 品質ガード用に、現在生成中の応答より前の最後のassistant応答を取り出す
function findPreviousAssistantContent(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") return message.content;
  }
  return undefined;
}

const SHARED_JA_CJK_MARKERS = /[会実時経]/g;
const KNOWN_XML_TAGS_PATTERN = /<\/?(?:response|action|dialogue|inner|narration|remember)[^>]*>?/g;

function hasLatinWord(text: string): boolean {
  return /[A-Za-z]{3,}/.test(text);
}

function hasJapaneseSignal(text: string): boolean {
  return /[ぁ-んァ-ヶ一-龯]/u.test(text);
}

function runQualityChecksForClient(
  response: string,
  qualityContext: QualityCheckContext,
): QualityCheckResult {
  const result = runQualityChecks(response, qualityContext);
  if (result.passed || !isE2eStrictQualityMode()) return result;

  if (result.failedCheck === "multilingual-leak") {
    const visibleText = stripXmlTags(response);
    const neutralized = response.replace(SHARED_JA_CJK_MARKERS, "日");
    if (visibleText !== response && hasJapaneseSignal(visibleText)) {
      return runQualityChecks(neutralized, qualityContext);
    }
  }

  if (result.failedCheck === "no-english") {
    const visibleText = response.replace(KNOWN_XML_TAGS_PATTERN, "").trim();
    if (hasJapaneseSignal(visibleText) && !hasLatinWord(visibleText)) {
      return { passed: false, failedCheck: "xml-format-missing" };
    }
  }

  return result;
}

// SSEストリームを全て読み取り、完全なテキストを返す（再生成判定用）
async function collectStreamResponse(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model }),
  });

  if (!response.ok || !response.body) {
    throw new Error(await response.text());
  }

  let accumulated = "";
  await processStream(
    response.body,
    (chunk) => {
      accumulated += chunk;
    },
    () => {},
  );
  return accumulated;
}

// 初回ストリーミング: UIに即座に表示しつつテキストを蓄積
async function streamFirstAttempt(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
  onChunk: (text: string) => void,
): Promise<string> {
  let accumulated = "";
  let streamError: string | null = null;
  await streamChat(
    messages,
    model,
    (chunk) => {
      accumulated += chunk;
      onChunk(chunk);
    },
    () => {},
    (err) => {
      streamError = err;
    },
  );
  if (streamError) throw new Error(streamError);
  return accumulated;
}

// 会話フェーズでモデルがXMLラッパーを省略した場合の救済（最終リトライのみ）
// 初回〜中間リトライではXML欠落を品質ガードで検出し再生成を促す。
// 最終リトライでもなお平文の場合のみ<response><dialogue>で救済ラップする。
// 理由: T1でモデルがXMLを無視する問題の根本対策はリトライ指示による矯正。
// 全attemptで即座にラップすると<narration>/<inner>が永久に欠落する。
function applyConversationXmlFallback(
  response: string,
  phase: ScenePhase,
  attempt: number,
): string {
  const maxRetries = getEffectiveMaxQualityRetries(phase);
  if (
    phase === "conversation" &&
    !isXmlResponse(response) &&
    response.trim().length >= 4 &&
    attempt >= maxRetries
  ) {
    return wrapConversationPlainAsXml(response);
  }
  return response;
}

type QualityAttemptResult =
  | { status: "pass"; response: string; isRetry: boolean; warningLevel?: boolean }
  | { status: "retry"; response: string; failedCheck: string }
  | { status: "soft-fail"; response: string; failedCheck: string; isRetry: boolean }
  | { status: "error"; message: string };

async function executeQualityAttempt(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
  onChunk: (text: string) => void,
  qualityContext: QualityCheckContext,
  attempt: number,
  prevResponse: string,
  prevFailedCheck: string | null,
): Promise<QualityAttemptResult> {
  try {
    const maxRetries = getEffectiveMaxQualityRetries(qualityContext.phase);
    const response =
      attempt === 0
        ? await streamFirstAttempt(messages, model, onChunk)
        : await collectStreamResponse(
            buildRetryMessages(messages, prevResponse, qualityContext, prevFailedCheck),
            model,
          );

    const fallbackApplied = applyConversationXmlFallback(response, qualityContext.phase, attempt);
    if (fallbackApplied !== response) onChunk(fallbackApplied);

    const checkResult = runQualityChecksForClient(fallbackApplied, qualityContext);
    console.info(
      `[quality-guard] attempt=${attempt} len=${fallbackApplied.length} phase=${qualityContext.phase} passed=${checkResult.passed} failed=${checkResult.failedCheck ?? "none"}`,
    );

    if (checkResult.passed) {
      return { status: "pass", response: fallbackApplied, isRetry: attempt > 0 };
    }
    const failedCheck = checkResult.failedCheck ?? "unknown";
    if (attempt >= maxRetries) {
      if (isE2eStrictQualityMode()) {
        return {
          status: "soft-fail",
          response: fallbackApplied,
          failedCheck,
          isRetry: attempt > 0,
        };
      }
      return {
        status: "pass",
        response: fallbackApplied,
        isRetry: attempt > 0,
        warningLevel: true,
      };
    }
    return {
      status: "retry",
      response: fallbackApplied,
      failedCheck,
    };
  } catch (err) {
    console.error("executeQualityAttempt failed", err);
    return { status: "error", message: String(err) };
  }
}

export async function streamChatWithQualityGuard(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
  onChunk: (text: string) => void,
  onDone: (result: ChatStreamResult) => void,
  onError: (error: string) => void,
  qualityContext: QualityCheckContext,
): Promise<void> {
  let lastResponse = "";
  let lastFailedCheck: string | null = null;
  const effectiveQualityContext: QualityCheckContext = {
    ...qualityContext,
    prevAssistantResponse: qualityContext.prevAssistantResponse?.trim()
      ? qualityContext.prevAssistantResponse
      : findPreviousAssistantContent(messages),
  };
  const maxRetries = getEffectiveMaxQualityRetries(effectiveQualityContext.phase);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await executeQualityAttempt(
      messages,
      model,
      onChunk,
      effectiveQualityContext,
      attempt,
      lastResponse,
      lastFailedCheck,
    );

    switch (result.status) {
      case "pass":
        if (result.isRetry) onChunk(result.response);
        onDone({ content: result.response, warningLevel: result.warningLevel });
        return;
      case "retry":
        lastResponse = result.response;
        lastFailedCheck = result.failedCheck;
        break;
      case "soft-fail":
        if (result.isRetry) onChunk(result.response);
        onDone({ content: result.response, warningLevel: true });
        return;
      case "error":
        onError(result.message);
        return;
    }
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
