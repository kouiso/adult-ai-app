import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Menu, Search, X } from "lucide-react";
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
  streamChat,
  streamChatWithQualityGuard,
  type PersistedMessage,
} from "@/lib/api";
import {
  ALL_FIRST_PERSONS,
  buildMessagesForApi,
  extractFirstPerson,
} from "@/lib/chat-message-adapter";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/config";
import { parseSystemPrompt } from "@/lib/prompt-builder";
import { queryKey } from "@/lib/query-key";
import { detectScenePhase, type ScenePhase } from "@/lib/scene-phase";
import { parseXmlResponse } from "@/lib/xml-response-parser";
import type { ChatMessage } from "@/store/chat-store";
import { useChatStore } from "@/store/chat-store";
import { useSettingsStore } from "@/store/settings-store";

import { LegalLinks } from "../legal/legal-links";
import { Sheet, SheetContent } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";

import { ChatInput } from "./chat-input";
import { ConversationList } from "./conversation-list";
import { MessageBubble } from "./message-bubble";
import { SceneCardPicker } from "./scene-card-picker";

const IMAGE_PROMPT_MAX_LENGTH = 900;
// exponential backoff: 1s → 2s → 4s → 8s → cap 10s
const POLL_MAX_DELAY_MS = 10_000;
const AUTO_IMAGE_RECENT_TURN_LIMIT = 3;
const AUTO_IMAGE_PHASE_TRANSITIONS = new Set([
  "conversation:intimate",
  "intimate:erotic",
  "erotic:climax",
  "climax:afterglow",
]);

type ImagePollingResult =
  | { status: "succeeded"; imageUrl: string }
  | { status: "failed" }
  | { status: "timeout" };

type MessagePair = { user?: string; assistant?: string };

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

const canMessageSpeak = (
  ttsEnabled: boolean,
  message: { isStreaming?: boolean; content: string; role: string },
): boolean =>
  ttsEnabled && !message.isStreaming && !!message.content && message.role === "assistant";

const EmptyState = ({
  isMessageListLoading,
  onSelectScene,
}: {
  isMessageListLoading: boolean;
  onSelectScene: (scene: SceneCard) => void;
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
      <p className="text-lg font-semibold text-foreground">会話を始めましょう</p>
      <p className="mt-1 text-sm text-muted-foreground">メッセージを入力してください</p>
      <div className="mt-8 text-left">
        <SceneCardPicker sceneCards={sceneCards} onSelect={onSelectScene} />
      </div>
    </div>
  );
};

type SearchBarProps = {
  isSearchOpen: boolean;
  searchQuery: string;
  matchCount: number;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onQueryChange: (query: string) => void;
};

const SearchBar = ({
  isSearchOpen,
  searchQuery,
  matchCount,
  onOpenSearch,
  onCloseSearch,
  onQueryChange,
}: SearchBarProps) => {
  if (!isSearchOpen) {
    return (
      <div className="hidden md:flex justify-end px-4 pt-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          aria-label="メッセージを検索"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    );
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

export const ChatView = () => {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const setMessages = useChatStore((s) => s.setMessages);
  const setLoading = useChatStore((s) => s.setLoading);
  const nsfwBlur = useSettingsStore((s) => s.nsfwBlur);
  const isOnline = useNetworkStatus();
  const [isMobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
  const { currentSystemPrompt, currentCharacterName, currentCharacterAvatar, currentTitle } =
    useMemo(
      () => ({
        currentSystemPrompt: currentConversation?.characterSystemPrompt || DEFAULT_SYSTEM_PROMPT,
        currentCharacterName: currentConversation?.characterName ?? "AI",
        currentCharacterAvatar: currentConversation?.characterAvatar ?? null,
        currentTitle: currentConversation?.title ?? "新しい会話",
      }),
      [currentConversation],
    );

  const createConversationAndSelect = useCallback(async () => {
    const activeCharacterId = useSettingsStore.getState().activeCharacterId;
    const created = await createConversationEntry({
      characterId: activeCharacterId ?? undefined,
    });
    setConversationId(created.id);
    setMessages([]);
    setMobileDrawerOpen(false);
    return created;
  }, [createConversationEntry, setConversationId, setMessages]);

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
    async (conversationId: string, userText: string, assistantText: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv || conv.title !== "新しい会話") return;

      const model = useSettingsStore.getState().model;
      const newTitle = await generateConversationTitle(
        conversationId,
        [
          { role: "user", content: userText },
          { role: "assistant", content: assistantText },
        ],
        model,
      );
      if (newTitle) {
        await updateConversationTitleEntry(conversationId, newTitle);
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
    }: {
      text: string;
      conversationId: string;
      systemPrompt: string;
      characterName: string;
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
          updateMessage(assistantId, finalText, false, warningLevel);
          setLoading(false);
          void persistUserMessage
            .then(async () => {
              await createMessageEntry({
                conversationId,
                id: assistantId,
                role: "assistant",
                content: finalText,
              });
            })
            .then(() => void tryGenerateTitle(conversationId, text, finalText))
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
      await sendMessageToConversation({
        text,
        conversationId: conversation.id,
        systemPrompt: conversation.characterSystemPrompt || DEFAULT_SYSTEM_PROMPT,
        characterName: conversation.characterName ?? "AI",
      });
    },
    [ensureConversationForSend, isOnline, sendMessageToConversation],
  );

  const handleStartScene = useCallback(
    async (scene: SceneCard) => {
      if (!isOnline) {
        toast.error("オフライン中はシーン開始できません");
        return;
      }

      try {
        const created = await createConversationAndSelect();
        await sendMessageToConversation({
          text: scene.firstMessage,
          conversationId: created.id,
          systemPrompt: created.characterSystemPrompt || DEFAULT_SYSTEM_PROMPT,
          characterName: created.characterName ?? "AI",
        });
      } catch (error) {
        console.error("failed to start scene", error);
        toast.error("シーン開始に失敗しました");
      }
    },
    [createConversationAndSelect, isOnline, sendMessageToConversation],
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

      updateMessage(messageId, "", true);
      setLoading(true);

      let accumulated = "";
      await streamChat(
        apiMessages,
        currentModel,
        (chunk) => {
          accumulated += chunk;
          startTransition(() => {
            updateMessage(messageId, accumulated, true);
          });
        },
        () => {
          updateMessage(messageId, accumulated, false);
          setLoading(false);
          void updateMessageContentEntry(messageId, accumulated).catch((error) =>
            console.error("failed to update message content", error),
          );
        },
        (error) => {
          markMessageError(messageId);
          setLoading(false);
          toast.error(`再生成に失敗しました: ${error}`);
        },
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

      let accumulated = "";
      await streamChat(
        apiMessages,
        currentModel,
        (chunk) => {
          accumulated += chunk;
          startTransition(() => {
            updateMessage(assistantId, accumulated, true);
          });
        },
        () => {
          updateMessage(assistantId, accumulated, false);
          setLoading(false);
          void createMessageEntry({
            conversationId,
            id: assistantId,
            role: "assistant",
            content: accumulated,
          }).catch((error) => console.error("failed to persist regenerated message", error));
        },
        (error) => {
          markMessageError(assistantId);
          setLoading(false);
          toast.error(`編集後の送信に失敗しました: ${error}`);
        },
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
          updateMessage(errorMessageId, accumulated, false);
          setLoading(false);
          // 初回送信失敗時にDB未永続化のため、createで永続化
          void createMessageEntry({
            conversationId,
            id: errorMessageId,
            role: "assistant",
            content: accumulated,
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
              if (userMsg) void tryGenerateTitle(conversationId, userMsg.content, accumulated);
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

  const handleGenerateImage = useCallback(async (options?: { lockInput?: boolean }) => {
    if (!isOnline) {
      toast.error("オフライン中は画像生成できません");
      return;
    }

    const {
      messages: msgs,
      addMessage,
      updateMessage,
      updateMessageImage,
    } = useChatStore.getState();
    const hasAssistantMessage = msgs.some((m) => m.role === "assistant" && m.content);
    if (!hasAssistantMessage) return;

    const sceneDescription = buildImagePromptFromHistory(msgs);
    const phase = detectScenePhase(msgs);
    const prompt = sceneDescription.slice(0, IMAGE_PROMPT_MAX_LENGTH);
    const imageMessageId = crypto.randomUUID();
    const conversationId = useChatStore.getState().currentConversationId;
    const lockInput = options?.lockInput ?? true;

    if (!conversationId) return;

    // キャラの見た目情報を抽出して画像プロンプトに渡す
    const charDesc = currentConversation?.characterSystemPrompt
      ? parseSystemPrompt(currentConversation.characterSystemPrompt).personality
      : "";

    if (lockInput) setLoading(true);
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
      const result = await generateImage(prompt, charDesc, phase);
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
    } finally {
      if (lockInput) setLoading(false);
    }
  }, [
    createMessageEntry,
    persistMessageImageEntry,
    updateMessageContentEntry,
    isOnline,
    setLoading,
    currentConversation?.characterSystemPrompt,
  ]);

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

    void handleGenerateImage({ lockInput: false });
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
    () =>
      messages.filter(
        (m): m is ChatMessage & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant",
      ),
    [messages],
  );

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
        {/* スマホ用ヘッダー（md以上では非表示） */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-card/80 glass-effect px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="会話リストを開く"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-medium text-muted-foreground flex-1">
            {currentTitle}
          </span>
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="メッセージを検索"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>

        {!isOnline && (
          <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            オフライン中です。会話履歴は閲覧できますが、新規送信はできません。
          </div>
        )}

        <SearchBar
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          matchCount={highlightedMessageIds.size}
          onOpenSearch={() => setSearchOpen(true)}
          onCloseSearch={() => {
            setSearchOpen(false);
            setSearchQuery("");
          }}
          onQueryChange={setSearchQuery}
        />

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-chat-area">
          <div className="mx-auto max-w-3xl py-4">
            {messages.length === 0 && (
              <div className="flex h-[60vh] items-center justify-center">
                <EmptyState
                  isMessageListLoading={isMessageListLoading}
                  onSelectScene={stableOnStartScene}
                />
              </div>
            )}
            {visibleMessages.map((message) => (
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
                isHighlighted={highlightedMessageIds.has(message.id)}
                onSpeak={handleSpeak}
                onStopSpeaking={handleStopSpeaking}
                onRegenerate={stableHandleRegenerate}
                onEdit={stableHandleEdit}
                onRetry={stableHandleRetry}
              />
            ))}
          </div>
        </div>
        <ChatInput
          onSend={stableHandleSend}
          onGenerateImage={stableHandleGenerateImage}
          isLoading={isInputDisabled}
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
