import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, Loader2, Menu, Search, Sparkles, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { sceneCards, type SceneCard } from "@/data/scene-cards";
import { useChatQuery } from "@/hook/use-chat-query";
import { useNetworkStatus } from "@/hook/use-network-status";
import { useSpeechSynthesis } from "@/hook/use-speech-synthesis";
import {
  generateConversationTitle,
  generateImage,
  getImageTaskResult,
  listConversationMessages,
  persistImageToR2,
  searchConversationMessages,
  streamChat,
  streamChatWithQualityGuard,
  type ConversationSummary,
  type MessageSearchResult,
  type PersistedMessage,
} from "@/lib/api";
import {
  ALL_FIRST_PERSONS,
  buildMessagesForApi,
  extractFirstPerson,
  normalizeAssistantMessageContent,
  type ApiMessage,
} from "@/lib/chat-message-adapter";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/config";
import { buildMessageSearchSnippet } from "@/lib/message-search";
import { buildSystemPrompt, parseSystemPrompt } from "@/lib/prompt-builder";
import type { QualityCheckContext } from "@/lib/quality-guard";
import { queryKey } from "@/lib/query-key";
import { detectScenePhase, type ScenePhase } from "@/lib/scene-phase";
import { parseXmlResponse } from "@/lib/xml-response-parser";
import type { ChatMessage } from "@/store/chat-store";
import { useChatStore } from "@/store/chat-store";
import { useSettingsStore } from "@/store/settings-store";

import { LegalLinks } from "../legal/legal-links";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Sheet, SheetContent } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";

import { ChatInput } from "./chat-input";
import { ConversationList } from "./conversation-list";
import { MessageBubble } from "./message-bubble";
import { SceneCardPicker } from "./scene-card-picker";

const IMAGE_PROMPT_MAX_LENGTH = 900;
const TITLE_FALLBACK_MAX_LENGTH = 20;
const SCENE_INTRO_KIND = "scene-intro";
// 指数バックオフ: 1秒 → 2秒 → 4秒 → 8秒 → 上限10秒
const POLL_MAX_DELAY_MS = 10_000;
const AUTO_IMAGE_RECENT_TURN_LIMIT = 3;
const AUTO_IMAGE_START_DELAY_MS = 700;
const MESSAGE_SEARCH_RESULT_LIMIT = 25;
const MESSAGE_SEARCH_DEBOUNCE_MS = 300;
const SEARCH_JUMP_SUPPRESS_AUTO_SCROLL_MS = 350;
const AUTO_IMAGE_PHASE_TRANSITIONS = new Set([
  "conversation:intimate",
  "intimate:erotic",
  "erotic:climax",
  "climax:afterglow",
]);

const getMessageSelector = (messageId: string) =>
  `[data-message-id="${messageId.replace(/["\\]/g, "\\$&")}"]`;

type ImagePollingResult =
  | { status: "succeeded"; imageUrl: string }
  | { status: "failed" }
  | { status: "timeout" };

type MessagePair = { user?: string; assistant?: string };
type SceneConversationPrompt = { systemPrompt: string; characterName: string };
type SceneConversationPrompts = Record<string, SceneConversationPrompt>;
type SearchScope = "current" | "all";
type SearchResultsByScope = Record<SearchScope, MessageSearchResult[]>;
type VisibleMessage = ChatMessage & { role: "user" | "assistant" };

const SEARCH_SCOPES: SearchScope[] = ["current", "all"];
const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  current: "現在の会話",
  all: "全会話",
};

type ChatHeaderInfo = {
  name: string;
  avatar: string | null;
  relationship: string | null;
  sceneTitle: string | null;
};

type SceneCharacterInfo = {
  name: string | null;
  avatar: string | null;
  relationship: string | null;
};

type SceneIntroContent = {
  title: string;
  summary: string;
  characterName: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const firstNonEmptyString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const stringValue = readNonEmptyString(value);
    if (stringValue) return stringValue;
  }

  return null;
};

const readMessageCreatedAt = (message: ChatMessage): number | null => {
  const createdAt = (message as ChatMessage & { createdAt?: unknown }).createdAt;
  return typeof createdAt === "number" ? createdAt : null;
};

const buildCurrentConversationSearchResults = ({
  messages,
  query,
  conversationId,
  conversationTitle,
  characterName,
  characterAvatar,
  fallbackCreatedAt,
}: {
  messages: VisibleMessage[];
  query: string;
  conversationId: string | null;
  conversationTitle: string;
  characterName: string;
  characterAvatar: string | null;
  fallbackCreatedAt: number;
}): MessageSearchResult[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!conversationId || normalizedQuery.length === 0) return [];

  return messages
    .filter((message) => message.content.toLowerCase().includes(normalizedQuery))
    .map((message) => ({
      messageId: message.id,
      conversationId,
      conversationTitle,
      role: message.role,
      content: message.content,
      createdAt: readMessageCreatedAt(message) ?? fallbackCreatedAt,
      characterName,
      characterAvatar,
    }));
};

const readSceneCharacterInfo = (scene: SceneCard | null): SceneCharacterInfo | null => {
  if (!scene) return null;

  const character: unknown = scene.character;
  if (!character) return null;

  if (typeof character === "string") {
    return {
      name: readNonEmptyString(character),
      avatar: null,
      relationship: null,
    };
  }

  if (typeof character !== "object") return null;
  if (!isRecord(character)) return null;

  return {
    name: readNonEmptyString(character.name),
    avatar: readNonEmptyString(character.avatar),
    relationship:
      readNonEmptyString(character.relationship) ??
      readNonEmptyString(character.relation) ??
      readNonEmptyString(character.subtitle),
  };
};

const buildSceneIntroContent = (scene: SceneCard): string =>
  JSON.stringify({
    kind: SCENE_INTRO_KIND,
    title: scene.title,
    summary: scene.summary,
    characterName: scene.character.name,
  });

const parseSceneIntroContent = (content: string): SceneIntroContent | null => {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed) || parsed.kind !== SCENE_INTRO_KIND) return null;

    const title = readNonEmptyString(parsed.title);
    const summary = readNonEmptyString(parsed.summary);
    if (!title || !summary) return null;

    return {
      title,
      summary,
      characterName: readNonEmptyString(parsed.characterName),
    };
  } catch {
    return null;
  }
};

const buildSceneIntroMessage = (scene: SceneCard): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "system",
  content: buildSceneIntroContent(scene),
});

const truncateTitleFallback = (source: string): string | null => {
  const trimmed = source.trim();
  if (!trimmed) return null;

  const characters = Array.from(trimmed);
  if (characters.length <= TITLE_FALLBACK_MAX_LENGTH) return trimmed;

  return `${characters.slice(0, TITLE_FALLBACK_MAX_LENGTH).join("")}...`;
};

const buildFallbackConversationTitle = (
  firstUserMessage: string,
  preferredTitle?: string,
): string =>
  firstNonEmptyString(
    preferredTitle,
    sceneCards.find((scene) => scene.firstMessage === firstUserMessage)?.title,
    truncateTitleFallback(firstUserMessage),
  ) ?? "会話";

const extractRelationshipSubtitle = (systemPrompt?: string): string | null => {
  if (!systemPrompt) return null;

  const normalized = systemPrompt.replace(/\\n/g, "\n");
  const marker = "【関係性】";
  const startIdx = normalized.indexOf(marker);
  if (startIdx === -1) return null;

  const contentStart = startIdx + marker.length;
  const endMarkers = ["【シナリオ】", "【追加設定】", "【キャラカード】"];
  const endIdx = endMarkers.reduce((nearest, endMarker) => {
    const idx = normalized.indexOf(endMarker, contentStart);
    return idx === -1 ? nearest : Math.min(nearest, idx);
  }, normalized.length);

  return readNonEmptyString(normalized.slice(contentStart, endIdx).replace(/\s+/g, " "));
};

const getAvatarFallback = (name: string): string => Array.from(name.trim()).slice(0, 2).join("");

const getSceneConversationPrompt = (
  conversationId: string | null,
  sceneConversationPrompts: SceneConversationPrompts,
): SceneConversationPrompt | undefined =>
  conversationId ? sceneConversationPrompts[conversationId] : undefined;

const getConversationSendContext = (
  conversation: Pick<ConversationSummary, "characterSystemPrompt" | "characterName">,
  scenePrompt?: SceneConversationPrompt | null,
): SceneConversationPrompt => ({
  systemPrompt:
    firstNonEmptyString(scenePrompt?.systemPrompt, conversation.characterSystemPrompt) ??
    DEFAULT_SYSTEM_PROMPT,
  characterName:
    firstNonEmptyString(scenePrompt?.characterName, conversation.characterName) ?? "AI",
});

const getCurrentConversationDetails = (
  conversation: ConversationSummary | undefined,
  scenePrompt: SceneConversationPrompt | undefined,
) => {
  const sendContext = getConversationSendContext(
    {
      characterSystemPrompt: conversation?.characterSystemPrompt ?? "",
      characterName: conversation?.characterName ?? "",
    },
    scenePrompt,
  );

  return {
    currentSystemPrompt: sendContext.systemPrompt,
    currentCharacterName: sendContext.characterName,
    currentCharacterAvatar: readNonEmptyString(conversation?.characterAvatar),
    currentTitle: firstNonEmptyString(conversation?.title) ?? "新しい会話",
  };
};

const buildChatHeaderInfo = ({
  currentCharacterAvatar,
  currentCharacterName,
  currentConversation,
  currentSceneCard,
  currentSystemPrompt,
}: {
  currentCharacterAvatar: string | null;
  currentCharacterName: string;
  currentConversation: ConversationSummary | undefined;
  currentSceneCard: SceneCard | null;
  currentSystemPrompt: string;
}): ChatHeaderInfo => {
  const sceneCharacterInfo = readSceneCharacterInfo(currentSceneCard);

  return {
    name:
      firstNonEmptyString(
        currentCharacterName,
        currentConversation?.characterName,
        sceneCharacterInfo?.name,
      ) ?? "AI",
    avatar: firstNonEmptyString(
      currentConversation?.characterAvatar,
      currentCharacterAvatar,
      sceneCharacterInfo?.avatar,
    ),
    relationship: firstNonEmptyString(
      extractRelationshipSubtitle(currentSystemPrompt),
      sceneCharacterInfo?.relationship,
    ),
    sceneTitle: firstNonEmptyString(currentSceneCard?.title),
  };
};

const hasContent = (m: ChatMessage): boolean => m.content.length > 0;

const buildFallbackPair = (reversedMsgs: ChatMessage[]): MessagePair[] => {
  const lastUser = reversedMsgs.find((m) => m.role === "user" && hasContent(m));
  const lastAssistant = reversedMsgs.find((m) => m.role === "assistant" && hasContent(m));
  return [
    {
      user: lastUser?.content.slice(0, 200),
      assistant: lastAssistant?.content.slice(0, 200),
    },
  ];
};

const hasContinueConversationContent = (messages: PersistedMessage[]): boolean =>
  messages.some((message) => message.role === "assistant" && message.content.trim().length > 0);

const buildSceneConversationPrompt = (scene: SceneCard): SceneConversationPrompt => ({
  systemPrompt: buildSystemPrompt(
    {
      name: "",
      personality: "",
      appearance: "",
      scenario: scene.summary,
      custom: "",
    },
    scene.character,
  ),
  characterName: scene.character.name,
});

const hasSceneFirstMessage = (scene: SceneCard, messages: ChatMessage[]): boolean =>
  messages.some((message) => message.role === "user" && message.content === scene.firstMessage);

const findCurrentSceneCard = (currentTitle: string, messages: ChatMessage[]): SceneCard | null =>
  sceneCards.find((scene) => scene.title === currentTitle) ??
  sceneCards.find((scene) => hasSceneFirstMessage(scene, messages)) ??
  null;

const getSceneStartPrompt = (
  scene: SceneCard,
  activeCharacterId: string | null | undefined,
): SceneConversationPrompt | null => {
  if (activeCharacterId) return null;
  return buildSceneConversationPrompt(scene);
};

const collectRecentMessagePairs = (msgs: ChatMessage[], maxTurns: number): MessagePair[] => {
  const pairs: MessagePair[] = [];
  const reversedMsgs = [...msgs].reverse();
  let userCount = 0;

  for (const m of reversedMsgs) {
    if (m.role === "user" && hasContent(m)) {
      userCount++;
      if (userCount > maxTurns) break;
      pairs.unshift({ user: m.content.slice(0, 200) });
      continue;
    }
    const canAttachAssistant =
      m.role === "assistant" && hasContent(m) && pairs.length > 0 && !pairs[0].assistant;
    if (canAttachAssistant) {
      pairs[0].assistant = m.content.slice(0, 200);
    }
  }

  return pairs.length > 0 ? pairs : buildFallbackPair(reversedMsgs);
};

const formatMessagePairsForPrompt = (pairs: MessagePair[]): string => {
  const historyLines = pairs.map((pair, i) => {
    const isLatest = i === pairs.length - 1;
    const prefix = isLatest ? "[最新]" : `[${i + 1}ターン前]`;
    const parts: string[] = [];
    if (pair.user) parts.push(`${prefix} ユーザー: ${pair.user}`);
    if (pair.assistant) parts.push(`${prefix} キャラ: ${pair.assistant}`);
    return parts.join("\n");
  });
  return historyLines.filter(Boolean).join("\n");
};

const isAutoImagePhaseTransition = (previousPhase: ScenePhase, currentPhase: ScenePhase): boolean =>
  AUTO_IMAGE_PHASE_TRANSITIONS.has(`${previousPhase}:${currentPhase}`);

const hasImageInRecentTurns = (msgs: ChatMessage[], maxTurns: number): boolean => {
  let userTurns = 0;
  for (const message of [...msgs].reverse()) {
    if (message.imageUrl) return true;
    if (message.role === "user") {
      userTurns++;
      if (userTurns >= maxTurns) return false;
    }
  }
  return false;
};

/** 直近N ターンの会話履歴から画像生成用のシーン記述テキストを組み立てる */
const buildImagePromptFromHistory = (msgs: ChatMessage[]): string => {
  const pairs = collectRecentMessagePairs(msgs, 3);
  return formatMessagePairsForPrompt(pairs);
};

type ImageResultHandlerDeps = {
  imageMessageId: string;
  updateMessage: (
    id: string,
    content: string,
    isStreaming: boolean,
    warningLevel?: boolean,
  ) => void;
  updateMessageImage: (id: string, imageUrl: string) => void;
  persistMessageImageEntry: (params: {
    messageId: string;
    imageUrl: string;
    imageKey?: string;
  }) => Promise<unknown>;
  updateMessageContentEntry: (id: string, content: string) => Promise<unknown>;
};

type ImageGenerationSetup = Pick<
  ReturnType<typeof useChatStore.getState>,
  "addMessage" | "updateMessage" | "updateMessageImage"
> & {
  msgs: ChatMessage[];
};

type AutoImageMessageIdsSetter = (update: (ids: Set<string>) => Set<string>) => void;

type ImageGenerationTaskDeps = ImageResultHandlerDeps & {
  prompt: string;
  characterDescription: string;
  phase: ScenePhase;
};

const addAutoImageMessageId = (
  isAutoGeneration: boolean,
  imageMessageId: string,
  setActiveIds: AutoImageMessageIdsSetter,
): void => {
  if (!isAutoGeneration) return;
  setActiveIds((ids) => new Set(ids).add(imageMessageId));
};

const removeAutoImageMessageId = (
  isAutoGeneration: boolean,
  imageMessageId: string,
  setActiveIds: AutoImageMessageIdsSetter,
): void => {
  if (!isAutoGeneration) return;
  setActiveIds((ids) => {
    const nextIds = new Set(ids);
    nextIds.delete(imageMessageId);
    return nextIds;
  });
};

const getImageGenerationSetup = (isOnline: boolean): ImageGenerationSetup | null => {
  if (!isOnline) {
    toast.error("オフライン中は画像生成できません");
    return null;
  }

  const { messages: msgs, addMessage, updateMessage, updateMessageImage } = useChatStore.getState();
  const hasAssistantMessage = msgs.some((m) => m.role === "assistant" && m.content);
  if (!hasAssistantMessage) return null;

  return {
    msgs,
    addMessage,
    updateMessage,
    updateMessageImage,
  };
};

const getCharacterImageDescription = (characterSystemPrompt?: string): string => {
  if (!characterSystemPrompt) return "";
  return parseSystemPrompt(characterSystemPrompt).personality;
};

const mergeStreamChunk = (accumulated: string, chunk: string): string =>
  chunk.length > accumulated.length + 100 ? chunk : accumulated + chunk;

const buildQualityContext = (
  sourceMessages: ChatMessage[],
  apiMessages: ApiMessage[],
  systemPrompt: string,
): QualityCheckContext => {
  const assistantMessages = sourceMessages.filter(
    (message) => message.role === "assistant" && !message.isStreaming,
  );
  const firstPerson = extractFirstPerson(systemPrompt);
  return {
    phase: detectScenePhase(apiMessages),
    prevAssistantResponse: assistantMessages.at(-1)?.content,
    firstPerson: firstPerson ?? undefined,
    wrongFirstPersons: firstPerson
      ? ALL_FIRST_PERSONS.filter((candidate) => candidate !== firstPerson)
      : undefined,
    prevInnerTexts: assistantMessages
      .slice(-5)
      .map((message) => parseXmlResponse(message.content)?.inner ?? "")
      .filter((inner) => inner.length >= 5),
  };
};

/** ポーリング結果に応じてメッセージを更新する。処理完了なら true を返す */
const processImageResult = (
  imageResult: ImagePollingResult,
  deps: ImageResultHandlerDeps,
): boolean => {
  const {
    imageMessageId,
    updateMessage,
    updateMessageImage,
    persistMessageImageEntry,
    updateMessageContentEntry,
  } = deps;

  if (imageResult.status === "succeeded") {
    updateMessage(imageMessageId, "", false);
    updateMessageImage(imageMessageId, imageResult.imageUrl);
    void persistMessageImageEntry({
      messageId: imageMessageId,
      imageUrl: imageResult.imageUrl,
    }).catch((error) => console.error("failed to persist image", error));
    // Zustandだけでなく、D1側のcontentもクリアしないとリロード時にローディングテキストが残る
    void updateMessageContentEntry(imageMessageId, "").catch((error) =>
      console.error("failed to clear image message content", error),
    );
    // エフェメラルなS3 URLをR2に永続化し、永続URLに差し替える
    void persistImageToR2(imageResult.imageUrl, imageMessageId)
      .then((r2Result) => {
        if ("imageKey" in r2Result) {
          const r2Url = `/api/image/r2/${r2Result.imageKey}`;
          updateMessageImage(imageMessageId, r2Url);
          void persistMessageImageEntry({
            messageId: imageMessageId,
            imageUrl: r2Url,
            imageKey: r2Result.imageKey,
          }).catch((error) => console.error("failed to persist R2 image key", error));
        } else {
          console.error("R2 persist error:", r2Result.error);
        }
      })
      .catch((error) => console.error("failed to persist image to R2", error));
    return true;
  }

  if (imageResult.status === "failed") {
    updateMessage(imageMessageId, "❌ 画像生成に失敗しました", false);
    toast.error("画像生成に失敗しました");
    return true;
  }

  updateMessage(imageMessageId, "⏱️ タイムアウト：画像生成が完了しませんでした", false);
  toast.error("画像生成がタイムアウトしました");
  return true;
};

const pollGeneratedImage = async (
  taskId: string,
  onProgress?: (attempt: number, maxAttempts: number) => void,
): Promise<ImagePollingResult> => {
  const maxPolls = 20;
  for (let i = 0; i < maxPolls; i++) {
    const delay = Math.min(1000 * 2 ** Math.min(i, 3), POLL_MAX_DELAY_MS);
    onProgress?.(i + 1, maxPolls);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delay);
    });

    const poll = await getImageTaskResult(taskId);
    if (poll.task.status === "TASK_STATUS_SUCCEED" && poll.images?.[0]) {
      return { status: "succeeded", imageUrl: poll.images[0].image_url };
    }
    if (poll.task.status === "TASK_STATUS_FAILED" || poll.task.status === "TASK_STATUS_CANCELED") {
      return { status: "failed" };
    }
  }

  return { status: "timeout" };
};

const runImageGenerationTask = async ({
  prompt,
  characterDescription,
  phase,
  imageMessageId,
  updateMessage,
  updateMessageImage,
  persistMessageImageEntry,
  updateMessageContentEntry,
}: ImageGenerationTaskDeps): Promise<void> => {
  try {
    const result = await generateImage(prompt, characterDescription, phase);
    if ("error" in result) {
      updateMessage(imageMessageId, `❌ 画像生成エラー: ${result.error}`, false);
      return;
    }

    const imageResult = await pollGeneratedImage(result.task_id, (attempt, maxAttempts) => {
      updateMessage(imageMessageId, `🖼️ 画像を生成中... (${attempt}/${maxAttempts})`, true);
    });

    processImageResult(imageResult, {
      imageMessageId,
      updateMessage,
      updateMessageImage,
      persistMessageImageEntry,
      updateMessageContentEntry,
    });
  } catch (err) {
    updateMessage(imageMessageId, `❌ ネットワークエラー: ${String(err)}`, false);
  }
};

const canMessageSpeak = (
  ttsEnabled: boolean,
  message: { isStreaming?: boolean; content: string; role: string },
): boolean =>
  ttsEnabled && !message.isStreaming && !!message.content && message.role === "assistant";

const ChatHeader = ({
  info,
  onOpenMenu,
  onOpenSearch,
}: {
  info: ChatHeaderInfo;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) => (
  <header className="sticky top-0 z-10 h-14 max-h-14 border-b border-border/50 bg-card/85 glass-effect">
    <div className="mx-auto flex h-full max-w-3xl items-center gap-2 px-3 md:px-4">
      <Avatar className="size-7">
        {info.avatar ? <AvatarImage src={info.avatar} alt={info.name} /> : null}
        <AvatarFallback className="text-[11px] font-medium">
          {getAvatarFallback(info.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-5 text-foreground">{info.name}</p>
        {info.relationship ? (
          <p className="truncate text-xs leading-4 text-muted-foreground">{info.relationship}</p>
        ) : null}
      </div>
      {info.sceneTitle ? (
        <Badge
          variant="outline"
          className="max-w-[36vw] truncate text-muted-foreground sm:max-w-48"
        >
          {info.sceneTitle}
        </Badge>
      ) : null}
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-md p-1.5 transition-colors hover:bg-muted md:hidden"
        aria-label="会話リストを開く"
      >
        <Menu className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        className="rounded-md p-1.5 transition-colors hover:bg-muted"
        aria-label="メッセージを検索"
      >
        <Search className="h-5 w-5" />
      </button>
    </div>
  </header>
);

const EmptyState = ({
  isMessageListLoading,
  onSelectScene,
  onOpenCharacterManager,
  onOpenManualCharacterCreate,
}: {
  isMessageListLoading: boolean;
  onSelectScene: (scene: SceneCard) => void;
  onOpenCharacterManager?: () => void;
  onOpenManualCharacterCreate?: () => void;
}) => {
  if (isMessageListLoading) {
    return (
      <div className="w-full max-w-2xl space-y-4 px-4">
        <div className="ml-auto w-[70%] space-y-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[70%]" />
        </div>
        <div className="w-[78%] space-y-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[65%]" />
          <Skeleton className="h-4 w-[50%]" />
        </div>
        <div className="ml-auto w-[64%] space-y-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-[80%]" />
          <Skeleton className="h-4 w-[55%]" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl px-4 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <p className="text-3xl">💬</p>
      </div>
      <p className="text-lg font-semibold text-foreground">シーンを選んで始めよう</p>
      <p className="mt-1 text-sm text-muted-foreground">
        気分に近いカードを選ぶと、会話の導入から始まります
      </p>
      {onOpenCharacterManager || onOpenManualCharacterCreate ? (
        <div className="mt-5 flex flex-col items-center gap-2">
          {onOpenCharacterManager ? (
            <button
              type="button"
              onClick={onOpenCharacterManager}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Sparkles className="h-4 w-4" />
              AIでキャラクターを作る
            </button>
          ) : null}
          {onOpenManualCharacterCreate ? (
            <button
              type="button"
              onClick={onOpenManualCharacterCreate}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <UserPlus className="h-3.5 w-3.5" />
              1からキャラクターを作る
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-primary">
        <ArrowDown className="h-4 w-4" />
        下のシーンカードから選択
      </div>
      <div className="mt-3 rounded-2xl border border-primary/25 bg-primary/5 p-3 text-left shadow-[0_12px_36px_oklch(0.50_0.18_350_/_8%)]">
        <SceneCardPicker sceneCards={sceneCards} onSelect={onSelectScene} />
      </div>
    </div>
  );
};

const SceneIntroCard = ({ intro }: { intro: SceneIntroContent }) => (
  <div className="px-4 py-3">
    <div className="mx-auto max-w-2xl rounded-2xl border border-primary/20 bg-card/70 px-4 py-3 text-sm shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        シーン導入
      </div>
      <p className="mt-2 font-narrative text-base font-semibold text-foreground">{intro.title}</p>
      <p className="mt-1 italic leading-6 text-muted-foreground">{intro.summary}</p>
      {intro.characterName ? (
        <p className="mt-2 text-xs text-muted-foreground">
          登場キャラクター: {intro.characterName}
        </p>
      ) : null}
    </div>
  </div>
);

type SearchBarProps = {
  isSearchOpen: boolean;
  searchQuery: string;
  matchCount: number;
  onCloseSearch: () => void;
  onQueryChange: (query: string) => void;
};

const SearchBar = ({
  isSearchOpen,
  searchQuery,
  matchCount,
  onCloseSearch,
  onQueryChange,
}: SearchBarProps) => {
  if (!isSearchOpen) {
    return null;
  }

  return (
    <div className="border-b border-border/50 bg-card/80 px-4 py-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="メッセージを検索..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        {searchQuery.trim() && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {matchCount}件見つかりました
          </span>
        )}
        <button
          type="button"
          onClick={onCloseSearch}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
          aria-label="検索を閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

type GlobalSearchResultsProps = {
  isOpen: boolean;
  isFetching: boolean;
  query: string;
  resultsByScope: SearchResultsByScope;
  searchScope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  onSelectResult: (result: MessageSearchResult) => void;
};

const formatSearchResultTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const getSearchScopeButtonClassName = (isSelected: boolean) =>
  [
    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
    isSelected
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");

const isSearchScopeFetching = (scope: SearchScope, isFetching: boolean) =>
  scope === "all" && isFetching;

const GlobalSearchResults = ({
  isOpen,
  isFetching,
  query,
  resultsByScope,
  searchScope,
  onScopeChange,
  onSelectResult,
}: GlobalSearchResultsProps) => {
  const trimmedQuery = query.trim();
  if (!isOpen || !trimmedQuery) return null;

  const results = resultsByScope[searchScope];
  const scopeLabel = SEARCH_SCOPE_LABEL[searchScope];
  const isFetchingSelectedScope = isSearchScopeFetching(searchScope, isFetching);

  return (
    <div className="border-b border-border/50 bg-background/95 px-4 py-2">
      <div className="mx-auto max-h-72 max-w-3xl overflow-y-auto rounded-md border border-border/70 bg-card/85 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
          <div className="inline-flex rounded-md bg-muted p-0.5">
            {SEARCH_SCOPES.map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => onScopeChange(scope)}
                className={getSearchScopeButtonClassName(scope === searchScope)}
                aria-pressed={scope === searchScope}
              >
                {SEARCH_SCOPE_LABEL[scope]}
              </button>
            ))}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{results.length}件</span>
        </div>
        {isFetchingSelectedScope ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {scopeLabel}から検索中
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">{scopeLabel}に一致なし</div>
        ) : (
          <div className="divide-y divide-border/60">
            {results.map((result) => (
              <button
                key={result.messageId}
                type="button"
                onClick={() => onSelectResult(result)}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-accent/60"
              >
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="line-clamp-1 font-medium text-foreground">
                    {result.conversationTitle}
                  </span>
                  <span className="shrink-0">{formatSearchResultTime(result.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-5">
                  {buildMessageSearchSnippet(result.content, trimmedQuery)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.role === "user" ? "あなた" : result.characterName}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

type ChatViewProps = {
  // EmptyState の「AIでキャラクター作成」ボタンから親の CharacterManager Sheet を開くため
  onOpenCharacterManager?: () => void;
  onOpenManualCharacterCreate?: () => void;
};

const useDebouncedMessageSearchQuery = (isSearchOpen: boolean, normalizedSearchQuery: string) => {
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const nextDebouncedSearchQuery = isSearchOpen ? normalizedSearchQuery : "";
  const debounceDelay = nextDebouncedSearchQuery ? MESSAGE_SEARCH_DEBOUNCE_MS : 0;

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedSearchQuery(nextDebouncedSearchQuery),
      debounceDelay,
    );
    return () => window.clearTimeout(timeoutId);
  }, [debounceDelay, nextDebouncedSearchQuery]);

  return {
    debouncedSearchQuery,
    isSearchDebouncing:
      nextDebouncedSearchQuery.length > 0 && debouncedSearchQuery !== nextDebouncedSearchQuery,
  };
};

const isAnySearchLoading = (isFetching: boolean, isDebouncing: boolean) =>
  [isFetching, isDebouncing].some(Boolean);

const isGlobalMessageSearchEnabled = (
  isSearchOpen: boolean,
  searchScope: SearchScope,
  debouncedSearchQuery: string,
) => [isSearchOpen, searchScope === "all", debouncedSearchQuery.length > 0].every(Boolean);

const useAutoScrollToBottom = (
  messages: ChatMessage[],
  scrollToBottom: () => void,
  suppressAutoScrollRef: { current: boolean },
) => {
  useEffect(() => {
    if (suppressAutoScrollRef.current) return;
    scrollToBottom();
  }, [messages, scrollToBottom, suppressAutoScrollRef]);
};

const usePendingSearchJump = ({
  messages,
  pendingSearchMessageId,
  suppressAutoScrollRef,
  setPendingSearchMessageId,
}: {
  messages: ChatMessage[];
  pendingSearchMessageId: string | null;
  suppressAutoScrollRef: { current: boolean };
  setPendingSearchMessageId: (messageId: string | null) => void;
}) => {
  useEffect(() => {
    if (!pendingSearchMessageId) return;

    const target = document.querySelector(getMessageSelector(pendingSearchMessageId));
    if (!target && messages.length === 0) return;

    if (target) target.scrollIntoView({ block: "center", behavior: "smooth" });
    const timeoutId = window.setTimeout(
      () => {
        suppressAutoScrollRef.current = false;
        setPendingSearchMessageId(null);
      },
      target ? SEARCH_JUMP_SUPPRESS_AUTO_SCROLL_MS : 0,
    );
    return () => window.clearTimeout(timeoutId);
  }, [messages, pendingSearchMessageId, setPendingSearchMessageId, suppressAutoScrollRef]);
};

export const ChatView = ({
  onOpenCharacterManager,
  onOpenManualCharacterCreate,
}: ChatViewProps = {}) => {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const setMessages = useChatStore((s) => s.setMessages);
  const setLoading = useChatStore((s) => s.setLoading);
  const nsfwBlur = useSettingsStore((s) => s.nsfwBlur);
  const autoGenerateImages = useSettingsStore((s) => s.autoGenerateImages);
  const isOnline = useNetworkStatus();
  const [isMobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSearchMessageId, setPendingSearchMessageId] = useState<string | null>(null);
  const [imageGenerationCount, setImageGenerationCount] = useState(0);
  const [activeAutoImageMessageIds, setActiveAutoImageMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sceneConversationPrompts, setSceneConversationPrompts] =
    useState<SceneConversationPrompts>({});

  const { ttsEnabled, ttsVoiceUri, ttsRate, ttsPitch } = useSettingsStore(
    useShallow((s) => ({
      ttsEnabled: s.ttsEnabled,
      ttsVoiceUri: s.ttsVoiceUri,
      ttsRate: s.ttsRate,
      ttsPitch: s.ttsPitch,
    })),
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const previousScenePhaseRef = useRef<ScenePhase>("conversation");
  const pendingAutoImageAssistantIdsRef = useRef<Set<string>>(new Set());
  const suppressAutoScrollRef = useRef(false);
  const wasOfflineRef = useRef(false);

  const {
    conversations,
    isConversationListLoading,
    isMessageListLoading,
    createConversationEntry,
    deleteConversationEntry,
    deleteAllConversationsEntry,
    updateConversationTitleEntry,
    createMessageEntry,
    persistMessageImageEntry,
    updateMessageContentEntry,
    deleteMessagesAfterEntry,
    loadMessages,
  } = useChatQuery(currentConversationId);

  const normalizedSearchQuery = searchQuery.trim();
  const { debouncedSearchQuery, isSearchDebouncing } = useDebouncedMessageSearchQuery(
    isSearchOpen,
    normalizedSearchQuery,
  );
  const { data: globalSearchResults = [], isFetching: isGlobalSearchFetching } = useQuery({
    queryKey: queryKey.messageSearch(debouncedSearchQuery, MESSAGE_SEARCH_RESULT_LIMIT),
    queryFn: () => searchConversationMessages(debouncedSearchQuery, MESSAGE_SEARCH_RESULT_LIMIT),
    enabled: isGlobalMessageSearchEnabled(isSearchOpen, searchScope, debouncedSearchQuery),
    staleTime: 5_000,
  });
  const isGlobalSearchPending = isAnySearchLoading(isGlobalSearchFetching, isSearchDebouncing);

  const handleSpeakEnd = useCallback(() => setSpeakingMessageId(null), []);
  const { speak, stop, isSpeaking } = useSpeechSynthesis(
    ttsVoiceUri,
    ttsRate,
    ttsPitch,
    handleSpeakEnd,
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useAutoScrollToBottom(messages, scrollToBottom, suppressAutoScrollRef);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    if (wasOfflineRef.current) {
      toast.success("接続が復帰しました");
      wasOfflineRef.current = false;
    }
  }, [isOnline]);

  // 現在の会話のキャラクター情報（レンダー毎の再検索を防ぐ）
  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === currentConversationId),
    [conversations, currentConversationId],
  );
  const latestConversation = useMemo(() => conversations[0] ?? null, [conversations]);
  const { data: latestConversationMessages = [] } = useQuery({
    queryKey: latestConversation
      ? queryKey.conversationMessageList(latestConversation.id)
      : ["conversation-message-list", "none"],
    queryFn: () =>
      latestConversation ? listConversationMessages(latestConversation.id) : Promise.resolve([]),
    enabled: latestConversation !== null,
  });
  const currentScenePrompt = useMemo(
    () => getSceneConversationPrompt(currentConversationId, sceneConversationPrompts),
    [currentConversationId, sceneConversationPrompts],
  );
  const { currentSystemPrompt, currentCharacterName, currentCharacterAvatar, currentTitle } =
    useMemo(
      () => getCurrentConversationDetails(currentConversation, currentScenePrompt),
      [currentConversation, currentScenePrompt],
    );
  const currentSceneCard = useMemo(
    () => findCurrentSceneCard(currentTitle, messages),
    [currentTitle, messages],
  );
  const chatHeaderInfo = useMemo<ChatHeaderInfo>(
    () =>
      buildChatHeaderInfo({
        currentCharacterAvatar,
        currentCharacterName,
        currentConversation,
        currentSceneCard,
        currentSystemPrompt,
      }),
    [
      currentCharacterAvatar,
      currentCharacterName,
      currentConversation,
      currentSceneCard,
      currentSystemPrompt,
    ],
  );

  const createConversationAndSelect = useCallback(
    async (input?: { characterId?: string | null }) => {
      const activeCharacterId =
        input && "characterId" in input
          ? input.characterId
          : useSettingsStore.getState().activeCharacterId;
      const created = await createConversationEntry({
        characterId: activeCharacterId ?? undefined,
      });
      setConversationId(created.id);
      setMessages([]);
      setMobileDrawerOpen(false);
      return created;
    },
    [createConversationEntry, setConversationId, setMessages],
  );

  const rememberSceneConversationPrompt = useCallback(
    (conversationId: string, scenePrompt: SceneConversationPrompt | null) => {
      if (!scenePrompt) return;

      setSceneConversationPrompts((previous) => ({
        ...previous,
        [conversationId]: scenePrompt,
      }));
    },
    [],
  );

  const ensureConversationForSend = useCallback(async () => {
    const currentId = useChatStore.getState().currentConversationId;
    if (currentId) {
      const found = conversations.find((conversation) => conversation.id === currentId);
      if (found) return found;
    }

    if (conversations.length > 0) {
      const first = conversations[0];
      setConversationId(first.id);
      const nextMessages = await loadMessages(first.id);
      // 非同期ロード中に別の会話が選択された場合はスキップ
      if (useChatStore.getState().currentConversationId !== first.id) return first;
      setMessages(nextMessages);
      return first;
    }

    return createConversationAndSelect();
  }, [conversations, createConversationAndSelect, loadMessages, setConversationId, setMessages]);

  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      try {
        if (currentConversationId) return;
        // 会話リストがロード中は実行しない（ローディング前の空配列で誤って新規作成するのを防ぐ）
        if (isConversationListLoading) return;
        const listed = conversations;
        if (!alive) return;

        if (listed.length === 0) {
          setConversationId(null);
          setMessages([]);
          return;
        }

        setConversationId(listed[0].id);
        const nextMessages = await loadMessages(listed[0].id);
        if (!alive) return;
        // 非同期ロード中に別の会話が選択された場合はスキップ
        if (useChatStore.getState().currentConversationId !== listed[0].id) return;
        setMessages(nextMessages);
      } catch (error) {
        console.error("failed to bootstrap conversations", error);
      }
    };

    void bootstrap();
    return () => {
      alive = false;
    };
  }, [
    conversations,
    currentConversationId,
    isConversationListLoading,
    loadMessages,
    setConversationId,
    setMessages,
  ]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      setConversationId(conversationId);
      setMessages([]);
      setMobileDrawerOpen(false);
      try {
        const nextMessages = await loadMessages(conversationId);
        // 非同期ロード中にユーザーが別の会話に切り替えた場合、古いメッセージで上書きしない
        if (useChatStore.getState().currentConversationId !== conversationId) return;
        setMessages(nextMessages);

        // グリーティングを表示（まだメッセージがない会話のみ）
        const conv = conversations.find((c) => c.id === conversationId);
        if (conv?.characterGreeting && nextMessages.length === 0) {
          useChatStore.getState().addMessage({
            id: `greeting-${conversationId}`,
            role: "assistant",
            content: conv.characterGreeting,
          });
        }
      } catch (error) {
        console.error("failed to load conversation", error);
      }
    },
    [conversations, loadMessages, setConversationId, setMessages],
  );

  const handleSelectSearchResult = useCallback(
    (result: MessageSearchResult) => {
      suppressAutoScrollRef.current = true;
      setPendingSearchMessageId(result.messageId);
      void handleSelectConversation(result.conversationId);
    },
    [handleSelectConversation],
  );

  usePendingSearchJump({
    messages,
    pendingSearchMessageId,
    suppressAutoScrollRef,
    setPendingSearchMessageId,
  });

  const handleCreateConversation = useCallback(async () => {
    try {
      const created = await createConversationAndSelect();

      // グリーティングがあれば即表示
      if (created.characterGreeting) {
        useChatStore.getState().addMessage({
          id: `greeting-${created.id}`,
          role: "assistant",
          content: created.characterGreeting,
        });
      }
    } catch (error) {
      console.error("failed to create conversation", error);
    }
  }, [createConversationAndSelect]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversationEntry(conversationId);
        if (currentConversationId !== conversationId) {
          toast.success("会話を削除しました");
          return;
        }
        const remaining = conversations.filter((c) => c.id !== conversationId);
        if (remaining.length === 0) {
          setConversationId(null);
          setMessages([]);
          toast.success("会話を削除しました");
          return;
        }
        setConversationId(remaining[0].id);
        const nextMessages = await loadMessages(remaining[0].id);
        // 非同期ロード中に別の会話が選択された場合はスキップ
        if (useChatStore.getState().currentConversationId === remaining[0].id) {
          setMessages(nextMessages);
        }
        toast.success("会話を削除しました");
      } catch (error) {
        console.error("failed to delete conversation", error);
        toast.error("削除に失敗しました");
      }
    },
    [
      conversations,
      currentConversationId,
      deleteConversationEntry,
      loadMessages,
      setConversationId,
      setMessages,
    ],
  );

  const handleDeleteAllConversations = useCallback(async () => {
    try {
      await deleteAllConversationsEntry();
      setConversationId(null);
      setMessages([]);
      toast.success("全会話を削除しました");
    } catch (error) {
      console.error("failed to delete all conversations", error);
      toast.error("全削除に失敗しました");
    }
  }, [deleteAllConversationsEntry, setConversationId, setMessages]);

  // タイトル自動生成（初回AI応答完了後に一度だけ実行）
  const tryGenerateTitle = useCallback(
    async (
      conversationId: string,
      userText: string,
      assistantText: string,
      fallbackTitle?: string,
    ) => {
      const conv = conversations.find((c) => c.id === conversationId);
      if (conv && conv.title !== "新しい会話") return;

      const fallback = buildFallbackConversationTitle(userText, fallbackTitle);

      try {
        const model = useSettingsStore.getState().model;
        const newTitle = await generateConversationTitle(
          conversationId,
          [
            { role: "user", content: userText },
            { role: "assistant", content: assistantText },
          ],
          model,
        );
        await updateConversationTitleEntry(conversationId, newTitle || fallback);
      } catch (error) {
        console.error("failed to generate conversation title", error);
        await updateConversationTitleEntry(conversationId, fallback).catch((updateError) =>
          console.error("failed to set fallback conversation title", updateError),
        );
      }
    },
    [conversations, updateConversationTitleEntry],
  );

  const buildApiMessages = useCallback(
    (msgs: ChatMessage[], systemPrompt: string, characterName: string) =>
      buildMessagesForApi(msgs, systemPrompt, characterName),
    [],
  );

  const sendMessageToConversation = useCallback(
    async ({
      text,
      conversationId,
      systemPrompt,
      characterName,
      fallbackTitle,
    }: {
      text: string;
      conversationId: string;
      systemPrompt: string;
      characterName: string;
      fallbackTitle?: string;
    }) => {
      const { addMessage, updateMessage, markMessageError } = useChatStore.getState();
      const currentModel = useSettingsStore.getState().model;
      const previousApiMessages = buildApiMessages(
        useChatStore.getState().messages,
        systemPrompt,
        characterName,
      );
      previousScenePhaseRef.current = detectScenePhase(previousApiMessages);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };
      addMessage(userMsg);

      const persistUserMessage = createMessageEntry({
        conversationId,
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
      }).catch((error) => {
        console.error("failed to persist user message", error);
        throw error;
      });

      const assistantId = crypto.randomUUID();
      addMessage({ id: assistantId, role: "assistant", content: "", isStreaming: true });
      pendingAutoImageAssistantIdsRef.current.add(assistantId);
      setLoading(true);

      const currentMessages = useChatStore.getState().messages;
      const apiMessages = buildApiMessages(currentMessages, systemPrompt, characterName);

      const phase = detectScenePhase(apiMessages);
      const assistantMessages = currentMessages.filter(
        (message) => message.role === "assistant" && !message.isStreaming,
      );
      const prevAssistant = assistantMessages.at(-1)?.content;
      const prevInnerTexts = assistantMessages
        .slice(-5)
        .map((message) => parseXmlResponse(message.content)?.inner ?? "")
        .filter((inner) => inner.length >= 5);

      let accumulated = "";
      await streamChatWithQualityGuard(
        apiMessages,
        currentModel,
        (chunk) => {
          if (chunk.length > accumulated.length + 100) {
            accumulated = chunk;
          } else {
            accumulated += chunk;
          }
          startTransition(() => {
            updateMessage(assistantId, accumulated, true);
          });
        },
        ({ content: finalText, warningLevel }) => {
          const assistantContent = normalizeAssistantMessageContent(finalText);
          updateMessage(assistantId, assistantContent, false, warningLevel);
          setLoading(false);
          void persistUserMessage
            .then(async () => {
              await createMessageEntry({
                conversationId,
                id: assistantId,
                role: "assistant",
                content: assistantContent,
              });
            })
            .then(
              () => void tryGenerateTitle(conversationId, text, assistantContent, fallbackTitle),
            )
            .catch((error) => console.error("failed to persist assistant message", error));
        },
        (error) => {
          pendingAutoImageAssistantIdsRef.current.delete(assistantId);
          markMessageError(assistantId);
          setLoading(false);
          toast.error(`メッセージ送信に失敗しました: ${error}`);
        },
        {
          phase,
          prevAssistantResponse: prevAssistant,
          firstPerson: extractFirstPerson(systemPrompt) ?? undefined,
          wrongFirstPersons: (() => {
            const firstPerson = extractFirstPerson(systemPrompt);
            return firstPerson
              ? ALL_FIRST_PERSONS.filter((candidate) => candidate !== firstPerson)
              : undefined;
          })(),
          prevInnerTexts,
        },
      );
    },
    [buildApiMessages, createMessageEntry, setLoading, tryGenerateTitle],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!isOnline) {
        toast.error("オフライン中はメッセージを送信できません");
        return;
      }

      const conversation = await ensureConversationForSend();
      const scenePrompt = sceneConversationPrompts[conversation.id];
      const sendContext = getConversationSendContext(conversation, scenePrompt);
      await sendMessageToConversation({
        text,
        conversationId: conversation.id,
        systemPrompt: sendContext.systemPrompt,
        characterName: sendContext.characterName,
      });
    },
    [ensureConversationForSend, isOnline, sceneConversationPrompts, sendMessageToConversation],
  );

  const handleStartScene = useCallback(
    async (scene: SceneCard) => {
      if (!isOnline) {
        toast.error("オフライン中はシーン開始できません");
        return;
      }

      try {
        const activeCharacterId = useSettingsStore.getState().activeCharacterId;
        const scenePrompt = getSceneStartPrompt(scene, activeCharacterId);
        const created = await createConversationAndSelect({ characterId: activeCharacterId });
        rememberSceneConversationPrompt(created.id, scenePrompt);
        const sceneIntroMessage = buildSceneIntroMessage(scene);
        await createMessageEntry({
          conversationId: created.id,
          id: sceneIntroMessage.id,
          role: sceneIntroMessage.role,
          content: sceneIntroMessage.content,
        });
        useChatStore.getState().addMessage(sceneIntroMessage);
        const sendContext = getConversationSendContext(created, scenePrompt);
        await sendMessageToConversation({
          text: scene.firstMessage,
          conversationId: created.id,
          systemPrompt: sendContext.systemPrompt,
          characterName: sendContext.characterName,
          fallbackTitle: scene.title,
        });
      } catch (error) {
        console.error("failed to start scene", error);
        toast.error("シーン開始に失敗しました");
      }
    },
    [
      createConversationAndSelect,
      createMessageEntry,
      isOnline,
      rememberSceneConversationPrompt,
      sendMessageToConversation,
    ],
  );

  // ── 再生成 ─────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (!isOnline) {
        toast.error("オフライン中は再生成できません");
        return;
      }

      const { messages: currentMsgs, updateMessage, markMessageError } = useChatStore.getState();
      const msgIndex = currentMsgs.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      const currentModel = useSettingsStore.getState().model;
      const conversationId = currentConversationId;
      if (!conversationId) return;

      // 対象メッセージより前のメッセージだけを使ってAPIを呼ぶ
      const prevMsgs = currentMsgs.slice(0, msgIndex);
      const apiMessages = buildApiMessages(prevMsgs, currentSystemPrompt, currentCharacterName);
      const qualityContext = buildQualityContext(prevMsgs, apiMessages, currentSystemPrompt);

      updateMessage(messageId, "", true);
      setLoading(true);

      let accumulated = "";
      await streamChatWithQualityGuard(
        apiMessages,
        currentModel,
        (chunk) => {
          accumulated = mergeStreamChunk(accumulated, chunk);
          startTransition(() => {
            updateMessage(messageId, accumulated, true);
          });
        },
        ({ content: finalText, warningLevel }) => {
          const assistantContent = normalizeAssistantMessageContent(finalText);
          updateMessage(messageId, assistantContent, false, warningLevel);
          setLoading(false);
          void updateMessageContentEntry(messageId, assistantContent).catch((error) =>
            console.error("failed to update message content", error),
          );
        },
        (error) => {
          markMessageError(messageId);
          setLoading(false);
          toast.error(`再生成に失敗しました: ${error}`);
        },
        qualityContext,
      );
    },
    [
      buildApiMessages,
      currentCharacterName,
      currentConversationId,
      currentSystemPrompt,
      isOnline,
      setLoading,
      updateMessageContentEntry,
    ],
  );

  // ── ユーザーメッセージ編集 ──────────────────────────────────────────────
  const handleEdit = useCallback(
    async (messageId: string, newContent: string) => {
      if (!isOnline) {
        toast.error("オフライン中は編集できません");
        return;
      }

      const conversationId = currentConversationId;
      if (!conversationId) return;

      const {
        messages: currentMsgs,
        setMessages: setStoreMsgs,
        updateMessage,
        markMessageError,
      } = useChatStore.getState();
      const msgIndex = currentMsgs.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      const currentModel = useSettingsStore.getState().model;

      // 編集対象以降のメッセージをストアから削除
      const trimmed = currentMsgs
        .slice(0, msgIndex + 1)
        .map((m) => (m.id === messageId ? { ...m, content: newContent } : m));
      setStoreMsgs(trimmed);

      // DB永続化はストリーム開始をブロックしない
      void (async () => {
        try {
          await deleteMessagesAfterEntry(conversationId, messageId);
          await updateMessageContentEntry(messageId, newContent);
        } catch (error) {
          console.error("failed to update message in db", error);
        }
      })();

      // 新しいAI応答を生成（DB操作の完了を待たずに即座に開始）
      const assistantId = crypto.randomUUID();
      useChatStore.getState().addMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      });
      setLoading(true);

      const latestMsgs = useChatStore.getState().messages;
      const apiMessages = buildApiMessages(latestMsgs, currentSystemPrompt, currentCharacterName);
      const qualityContext = buildQualityContext(latestMsgs, apiMessages, currentSystemPrompt);

      let accumulated = "";
      await streamChatWithQualityGuard(
        apiMessages,
        currentModel,
        (chunk) => {
          accumulated = mergeStreamChunk(accumulated, chunk);
          startTransition(() => {
            updateMessage(assistantId, accumulated, true);
          });
        },
        ({ content: finalText, warningLevel }) => {
          const assistantContent = normalizeAssistantMessageContent(finalText);
          updateMessage(assistantId, assistantContent, false, warningLevel);
          setLoading(false);
          void createMessageEntry({
            conversationId,
            id: assistantId,
            role: "assistant",
            content: assistantContent,
          }).catch((error) => console.error("failed to persist regenerated message", error));
        },
        (error) => {
          markMessageError(assistantId);
          setLoading(false);
          toast.error(`編集後の送信に失敗しました: ${error}`);
        },
        qualityContext,
      );
    },
    [
      buildApiMessages,
      createMessageEntry,
      currentCharacterName,
      currentConversationId,
      currentSystemPrompt,
      deleteMessagesAfterEntry,
      isOnline,
      setLoading,
      updateMessageContentEntry,
    ],
  );

  // エラーになったassistantメッセージを再利用してストリーミングを再試行する
  // handleSendを呼ぶとuserメッセージが重複するため、直接ストリームを再開する
  const handleRetry = useCallback(
    async (errorMessageId: string) => {
      if (!isOnline) {
        toast.error("オフライン中は再試行できません");
        return;
      }

      const { messages: currentMsgs, updateMessage, markMessageError } = useChatStore.getState();
      const errorMsgIndex = currentMsgs.findIndex((m) => m.id === errorMessageId);
      if (errorMsgIndex === -1) return;

      const conversationId = currentConversationId;
      if (!conversationId) return;

      const currentModel = useSettingsStore.getState().model;

      // エラーメッセージより前のメッセージでAPIコンテキストを構築
      const prevMsgs = currentMsgs.slice(0, errorMsgIndex);
      const apiMessages = buildApiMessages(prevMsgs, currentSystemPrompt, currentCharacterName);

      // 既存メッセージIDを再利用してストリーミングを再開（updateMessageでerrorもクリアされる）
      updateMessage(errorMessageId, "", true);
      setLoading(true);

      let accumulated = "";
      await streamChat(
        apiMessages,
        currentModel,
        (chunk) => {
          accumulated += chunk;
          startTransition(() => {
            updateMessage(errorMessageId, accumulated, true);
          });
        },
        () => {
          const assistantContent = normalizeAssistantMessageContent(accumulated);
          updateMessage(errorMessageId, assistantContent, false);
          setLoading(false);
          // 初回送信失敗時にDB未永続化のため、createで永続化
          void createMessageEntry({
            conversationId,
            id: errorMessageId,
            role: "assistant",
            content: assistantContent,
          })
            .then(() => {
              // リトライ成功時もタイトル自動生成を試みる
              const msgs = useChatStore.getState().messages;
              const userMsg = [...msgs]
                .slice(
                  0,
                  msgs.findIndex((m) => m.id === errorMessageId),
                )
                .reverse()
                .find((m) => m.role === "user");
              if (userMsg) {
                void tryGenerateTitle(conversationId, userMsg.content, assistantContent);
              }
            })
            .catch((error) => console.error("failed to persist retried message", error));
        },
        (error) => {
          markMessageError(errorMessageId);
          setLoading(false);
          toast.error(`再試行に失敗しました: ${error}`);
        },
      );
    },
    [
      buildApiMessages,
      createMessageEntry,
      currentCharacterName,
      currentConversationId,
      currentSystemPrompt,
      isOnline,
      setLoading,
      tryGenerateTitle,
    ],
  );

  const startImageGenerationUi = useCallback(
    (imageMessageId: string, isAutoGeneration: boolean, lockInput: boolean) => {
      setImageGenerationCount((count) => count + 1);
      if (lockInput) setLoading(true);
      addAutoImageMessageId(isAutoGeneration, imageMessageId, setActiveAutoImageMessageIds);
    },
    [setLoading],
  );

  const finishImageGenerationUi = useCallback(
    (imageMessageId: string, isAutoGeneration: boolean, lockInput: boolean) => {
      if (lockInput) setLoading(false);
      setImageGenerationCount((count) => Math.max(0, count - 1));
      removeAutoImageMessageId(isAutoGeneration, imageMessageId, setActiveAutoImageMessageIds);
    },
    [setLoading],
  );

  const handleGenerateImage = useCallback(
    async (options?: { lockInput?: boolean }) => {
      const setup = getImageGenerationSetup(isOnline);
      if (!setup) return;

      const { msgs, addMessage, updateMessage, updateMessageImage } = setup;
      const sceneDescription = buildImagePromptFromHistory(msgs);
      const phase = detectScenePhase(msgs);
      const prompt = sceneDescription.slice(0, IMAGE_PROMPT_MAX_LENGTH);
      const imageMessageId = crypto.randomUUID();
      const conversationId = useChatStore.getState().currentConversationId;
      const lockInput = options?.lockInput ?? true;
      const isAutoGeneration = !lockInput;

      if (!conversationId) return;

      // キャラの見た目情報を抽出して画像プロンプトに渡す
      const charDesc = getCharacterImageDescription(currentConversation?.characterSystemPrompt);

      startImageGenerationUi(imageMessageId, isAutoGeneration, lockInput);
      addMessage({
        id: imageMessageId,
        role: "assistant",
        content: "🖼️ 画像を生成中...",
        isStreaming: true,
      });
      // D1にメッセージを先に永続化する（後続のPATCH /messages/:id/imageがレコード不在で空振りするのを防ぐ）
      await createMessageEntry({
        conversationId,
        id: imageMessageId,
        role: "assistant",
        content: "🖼️ 画像を生成中...",
      }).catch((error) => console.error("failed to persist image message", error));

      try {
        await runImageGenerationTask({
          prompt,
          characterDescription: charDesc,
          phase,
          imageMessageId,
          updateMessage,
          updateMessageImage,
          persistMessageImageEntry,
          updateMessageContentEntry,
        });
      } finally {
        finishImageGenerationUi(imageMessageId, isAutoGeneration, lockInput);
      }
    },
    [
      createMessageEntry,
      finishImageGenerationUi,
      persistMessageImageEntry,
      startImageGenerationUi,
      updateMessageContentEntry,
      isOnline,
      currentConversation?.characterSystemPrompt,
    ],
  );

  useEffect(() => {
    const pendingIds = pendingAutoImageAssistantIdsRef.current;
    const completedAssistant = messages.find(
      (message) =>
        pendingIds.has(message.id) &&
        message.role === "assistant" &&
        !message.isStreaming &&
        message.content.trim().length > 0,
    );
    if (!completedAssistant) return;

    pendingIds.delete(completedAssistant.id);
    const currentPhase = detectScenePhase(messages);
    const previousPhase = previousScenePhaseRef.current;
    previousScenePhaseRef.current = currentPhase;

    if (!useSettingsStore.getState().autoGenerateImages) return;
    if (!isAutoImagePhaseTransition(previousPhase, currentPhase)) return;
    if (hasImageInRecentTurns(messages, AUTO_IMAGE_RECENT_TURN_LIMIT)) return;

    const timeoutId = window.setTimeout(() => {
      void handleGenerateImage({ lockInput: false });
    }, AUTO_IMAGE_START_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [handleGenerateImage, messages]);

  const stableOnSelectConversation = useCallback(
    (conversationId: string) => void handleSelectConversation(conversationId),
    [handleSelectConversation],
  );
  const stableOnCreateConversation = useCallback(
    () => void handleCreateConversation(),
    [handleCreateConversation],
  );
  const stableOnDeleteConversation = useCallback(
    (conversationId: string) => void handleDeleteConversation(conversationId),
    [handleDeleteConversation],
  );
  const stableOnDeleteAllConversations = useCallback(
    () => void handleDeleteAllConversations(),
    [handleDeleteAllConversations],
  );
  const stableOnStartScene = useCallback(
    (scene: SceneCard) => void handleStartScene(scene),
    [handleStartScene],
  );

  const continueConversationCard = useMemo(() => {
    if (!latestConversation || latestConversationMessages.length === 0) return null;
    if (!hasContinueConversationContent(latestConversationMessages)) return null;
    return {
      conversationId: latestConversation.id,
      characterName: latestConversation.characterName,
      characterAvatar: latestConversation.characterAvatar,
      updatedAt: latestConversation.updatedAt,
      messages: latestConversationMessages,
    };
  }, [latestConversation, latestConversationMessages]);

  const conversationListContent = useMemo(
    () => (
      <ConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        isLoading={isConversationListLoading}
        continueConversationCard={continueConversationCard}
        sceneCards={sceneCards}
        onSelect={stableOnSelectConversation}
        onCreate={stableOnCreateConversation}
        onStartScene={stableOnStartScene}
        onDelete={stableOnDeleteConversation}
        onDeleteAll={stableOnDeleteAllConversations}
      />
    ),
    [
      conversations,
      continueConversationCard,
      currentConversationId,
      isConversationListLoading,
      stableOnStartScene,
      stableOnSelectConversation,
      stableOnCreateConversation,
      stableOnDeleteConversation,
      stableOnDeleteAllConversations,
    ],
  );

  const visibleMessages = useMemo(
    () => messages.filter((m): m is VisibleMessage => m.role === "user" || m.role === "assistant"),
    [messages],
  );

  const currentSearchResults = useMemo(
    () =>
      buildCurrentConversationSearchResults({
        messages: visibleMessages,
        query: searchQuery,
        conversationId: currentConversationId,
        conversationTitle: currentTitle,
        characterName: currentCharacterName,
        characterAvatar: currentCharacterAvatar,
        fallbackCreatedAt: currentConversation?.updatedAt ?? 0,
      }),
    [
      currentCharacterAvatar,
      currentCharacterName,
      currentConversation?.updatedAt,
      currentConversationId,
      currentTitle,
      searchQuery,
      visibleMessages,
    ],
  );
  const searchResultsByScope = useMemo<SearchResultsByScope>(
    () => ({
      current: currentSearchResults,
      all: globalSearchResults,
    }),
    [currentSearchResults, globalSearchResults],
  );
  const scopedSearchMatchCount = searchResultsByScope[searchScope].length;

  // 検索クエリにマッチするメッセージIDのSet（ハイライト表示用）
  const highlightedMessageIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const query = searchQuery.trim().toLowerCase();
    return new Set(
      visibleMessages.filter((m) => m.content.toLowerCase().includes(query)).map((m) => m.id),
    );
  }, [visibleMessages, searchQuery]);

  const lastAssistantId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === "assistant") return visibleMessages[i].id;
    }
    return undefined;
  }, [visibleMessages]);

  // memo化されたMessageBubbleが参照安定なコールバックを受け取れるようにする
  const handleSpeak = useCallback(
    (messageId: string, text: string) => {
      setSpeakingMessageId(messageId);
      speak(text);
    },
    [speak],
  );

  const handleStopSpeaking = useCallback(() => {
    stop();
    setSpeakingMessageId(null);
  }, [stop]);

  const stableHandleRegenerate = useCallback(
    (id: string) => void handleRegenerate(id),
    [handleRegenerate],
  );

  const stableHandleEdit = useCallback(
    (id: string, content: string) => void handleEdit(id, content),
    [handleEdit],
  );

  const stableHandleSend = useCallback((msg: string) => void handleSend(msg), [handleSend]);

  const stableHandleRetry = useCallback((id: string) => void handleRetry(id), [handleRetry]);

  const stableHandleGenerateImage = useCallback(
    () => void handleGenerateImage(),
    [handleGenerateImage],
  );

  const isInputDisabled = isLoading || !isOnline;
  const isGeneratingImage = imageGenerationCount > 0;

  return (
    <div className="flex h-full">
      {/* デスクトップサイドバー */}
      <aside className="hidden w-72 shrink-0 border-r border-border/50 bg-gradient-sidebar text-sidebar-foreground md:flex md:flex-col">
        {conversationListContent}
      </aside>

      {/* スマホ用ドロワー */}
      <Sheet open={isMobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          {conversationListContent}
        </SheetContent>
      </Sheet>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <ChatHeader
          info={chatHeaderInfo}
          onOpenMenu={() => setMobileDrawerOpen(true)}
          onOpenSearch={() => setSearchOpen((prev) => !prev)}
        />

        {!isOnline && (
          <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            オフラインです。電波が戻ったら自動で送信できます
          </div>
        )}

        <SearchBar
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          matchCount={scopedSearchMatchCount}
          onCloseSearch={() => {
            setSearchOpen(false);
            setSearchQuery("");
          }}
          onQueryChange={setSearchQuery}
        />
        <GlobalSearchResults
          isOpen={isSearchOpen}
          isFetching={isGlobalSearchPending}
          query={searchQuery}
          resultsByScope={searchResultsByScope}
          searchScope={searchScope}
          onScopeChange={setSearchScope}
          onSelectResult={handleSelectSearchResult}
        />

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-chat-area">
          <div className="mx-auto max-w-3xl py-4">
            {messages.length === 0 && (
              <div className="flex h-[60vh] items-center justify-center">
                <EmptyState
                  isMessageListLoading={isMessageListLoading}
                  onSelectScene={stableOnStartScene}
                  onOpenCharacterManager={onOpenCharacterManager}
                  onOpenManualCharacterCreate={onOpenManualCharacterCreate}
                />
              </div>
            )}
            {messages.map((message) => {
              if (message.role === "system") {
                const intro = parseSceneIntroContent(message.content);
                return intro ? <SceneIntroCard key={message.id} intro={intro} /> : null;
              }

              const visibleIndex = visibleMessages.findIndex(
                (visibleMessage) => visibleMessage.id === message.id,
              );
              const previousVisibleMessage =
                visibleIndex > 0 ? visibleMessages[visibleIndex - 1] : null;

              return (
                <MessageBubble
                  key={message.id}
                  id={message.id}
                  role={message.role}
                  content={message.content}
                  imageUrl={message.imageUrl}
                  isStreaming={message.isStreaming}
                  isLoading={isLoading}
                  error={message.error}
                  warningLevel={message.warningLevel}
                  characterName={currentCharacterName}
                  characterAvatar={currentCharacterAvatar}
                  nsfwBlur={nsfwBlur}
                  canSpeak={canMessageSpeak(ttsEnabled, message)}
                  isSpeaking={speakingMessageId === message.id && isSpeaking}
                  isLast={message.id === lastAssistantId}
                  isAutoGeneratingImage={
                    autoGenerateImages && activeAutoImageMessageIds.has(message.id)
                  }
                  showLabel={
                    message.role === "assistant" &&
                    (visibleIndex === 0 || previousVisibleMessage?.role !== "assistant")
                  }
                  isHighlighted={highlightedMessageIds.has(message.id)}
                  onSpeak={handleSpeak}
                  onStopSpeaking={handleStopSpeaking}
                  onRegenerate={stableHandleRegenerate}
                  onEdit={stableHandleEdit}
                  onRetry={stableHandleRetry}
                />
              );
            })}
          </div>
        </div>
        <ChatInput
          onSend={stableHandleSend}
          onGenerateImage={stableHandleGenerateImage}
          isLoading={isInputDisabled}
          isGeneratingImage={isGeneratingImage}
        />
        <footer className="border-t border-border/50 bg-card/70 px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <LegalLinks className="justify-center sm:justify-end" />
          </div>
        </footer>
      </div>
    </div>
  );
};
