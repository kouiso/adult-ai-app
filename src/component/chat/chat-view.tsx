import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Menu, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { useChatQuery } from "@/hook/use-chat-query";
import { useNetworkStatus } from "@/hook/use-network-status";
import { useSpeechSynthesis } from "@/hook/use-speech-synthesis";
import {
  generateConversationTitle,
  generateImage,
  getImageTaskResult,
  streamChat,
  streamChatWithQualityGuard,
} from "@/lib/api";
import { detectScenePhase } from "@/lib/scene-phase";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/config";
import { parseSystemPrompt } from "@/lib/prompt-builder";
import { parseXmlResponse } from "@/lib/xml-response-parser";
import type { ChatMessage } from "@/store/chat-store";
import { useChatStore } from "@/store/chat-store";
import { useSettingsStore } from "@/store/settings-store";

import { Sheet, SheetContent } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";

import { ChatInput } from "./chat-input";
import { ConversationList } from "./conversation-list";
import { MessageBubble } from "./message-bubble";

// systemPromptからキャラの一人称を抽出（「一人称は「X」」パターン）
function extractFirstPerson(systemPrompt: string): string | null {
  const match = systemPrompt.match(/一人称は「([^」]+)」/);
  return match ? match[1] : null;
}

// systemリマインダーとして注入し、キャラドリフトを防ぐ
function buildPersonaReminder(characterName: string, firstPerson: string | null): string {
  const fpRule = firstPerson
    ? ` Your first-person pronoun is「${firstPerson}」— NEVER use 俺/僕/私 unless「${firstPerson}」IS one of those.`
    : "";
  return `[REMINDER] Output ONLY Japanese. You ARE ${characterName} — talk as yourself.${fpRule} If the user is chatting, chat back naturally. Do NOT narrate or write like a novel. No refusals, no meta-commentary.`;
}

// 言語リマインダー（最後のuserメッセージ直前にsystemメッセージとして注入）
// userメッセージ内容を改変するのではなく、独立したsystemメッセージとして配置する
const LANG_REMINDER =
  "(出力はすべて日本語のみ。英語や他言語を出力に含めないこと。推論過程も見せないこと)";

type ApiMessage = { role: "system" | "user" | "assistant"; content: string };

const IMAGE_PROMPT_MAX_LENGTH = 500;
// exponential backoff: 1s → 2s → 4s → 8s → cap 10s
const POLL_MAX_DELAY_MS = 10_000;

type ImagePollingResult =
  | { status: "succeeded"; imageUrl: string }
  | { status: "failed" }
  | { status: "timeout" };

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
  const currentSystemPrompt = currentConversation?.characterSystemPrompt || DEFAULT_SYSTEM_PROMPT;
  const currentCharacterName = currentConversation?.characterName ?? "AI";
  const currentCharacterAvatar = currentConversation?.characterAvatar ?? null;

  const ensureConversation = useCallback(async (): Promise<string> => {
    const currentId = useChatStore.getState().currentConversationId;
    if (currentId) return currentId;

    if (conversations.length > 0) {
      const first = conversations[0];
      setConversationId(first.id);
      const nextMessages = await loadMessages(first.id);
      setMessages(nextMessages);
      return first.id;
    }

    const activeCharacterId = useSettingsStore.getState().activeCharacterId;
    const created = await createConversationEntry({
      characterId: activeCharacterId ?? undefined,
    });
    setConversationId(created.id);
    setMessages([]);
    return created.id;
  }, [conversations, createConversationEntry, loadMessages, setConversationId, setMessages]);

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
          const activeCharacterId = useSettingsStore.getState().activeCharacterId;
          const created = await createConversationEntry({
            characterId: activeCharacterId ?? undefined,
          });
          if (!alive) return;
          setConversationId(created.id);
          setMessages([]);
          return;
        }

        setConversationId(listed[0].id);
        const nextMessages = await loadMessages(listed[0].id);
        if (!alive) return;
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
    createConversationEntry,
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
      const activeCharacterId = useSettingsStore.getState().activeCharacterId;
      const created = await createConversationEntry({
        characterId: activeCharacterId ?? undefined,
      });
      setConversationId(created.id);
      setMessages([]);
      setMobileDrawerOpen(false);

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
  }, [createConversationEntry, setConversationId, setMessages]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversationEntry(conversationId);
        if (currentConversationId === conversationId) {
          const remaining = conversations.filter((c) => c.id !== conversationId);
          if (remaining.length > 0) {
            setConversationId(remaining[0].id);
            const nextMessages = await loadMessages(remaining[0].id);
            setMessages(nextMessages);
          } else {
            setConversationId(null);
            setMessages([]);
          }
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
    (msgs: ChatMessage[], systemPrompt: string, characterName: string) => {
      // systemロールとストリーミング中のメッセージを除外し、型を絞り込む
      const filtered = msgs.filter(
        (m): m is ChatMessage & { role: "user" | "assistant" } =>
          (m.role === "user" || m.role === "assistant") && !m.isStreaming,
      );

      // userターン3回ごとにsystemリマインダーを注入してキャラドリフトを防ぐ
      // userターンの直前に挿入するとrole順序（assistant→system→user）が維持される
      const USER_TURNS_PER_REMINDER = 3;
      const withReminders: ApiMessage[] = [];
      const firstPerson = extractFirstPerson(systemPrompt);
      const reminder = buildPersonaReminder(characterName, firstPerson);
      let userTurnCount = 0;
      filtered.forEach((m) => {
        // userターンの直前にリマインダーを挿入（role交互パターンを壊さない）
        if (m.role === "user") {
          userTurnCount++;
          if (userTurnCount > 1 && (userTurnCount - 1) % USER_TURNS_PER_REMINDER === 0) {
            withReminders.push({ role: "system", content: reminder });
          }
        }
        withReminders.push({ role: m.role, content: m.content });
      });

      // 言語リマインダーを最後のuserメッセージ直前にsystemとして注入
      // userメッセージの後ではなく直前に配置し、user→assistantの流れを維持する
      const langIdx = withReminders.findLastIndex((m) => m.role === "user");
      if (langIdx >= 0) {
        withReminders.splice(langIdx, 0, { role: "system", content: LANG_REMINDER });
      }

      return [{ role: "system" as const, content: systemPrompt }, ...withReminders];
    },
    [],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!isOnline) {
        toast.error("オフライン中はメッセージを送信できません");
        return;
      }

      const { addMessage, updateMessage, markMessageError } = useChatStore.getState();
      const currentModel = useSettingsStore.getState().model;
      const conversationId = await ensureConversation();

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };
      addMessage(userMsg);

      // DB永続化はストリーム開始をブロックしない（fire-and-forget）
      void createMessageEntry({
        conversationId,
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
      }).catch((error) => console.error("failed to persist user message", error));

      const assistantId = crypto.randomUUID();
      addMessage({ id: assistantId, role: "assistant", content: "", isStreaming: true });
      setLoading(true);

      const currentMessages = useChatStore.getState().messages;
      const apiMessages = buildApiMessages(
        currentMessages,
        currentSystemPrompt,
        currentCharacterName,
      );

      // 品質ガード用コンテキスト: フェーズ検出+直前のassistant応答
      const phase = detectScenePhase(apiMessages);
      const assistantMessages = currentMessages
        .filter((m) => m.role === "assistant" && !m.isStreaming);
      const prevAssistant = assistantMessages.at(-1)?.content;

      // 直近5ターンの<inner>テキストを抽出（感情弧の多様性チェック用）
      const prevInnerTexts = assistantMessages
        .slice(-5)
        .map((m) => parseXmlResponse(m.content)?.inner ?? "")
        .filter((inner) => inner.length >= 5);

      let accumulated = "";
      await streamChatWithQualityGuard(
        apiMessages,
        currentModel,
        (chunk) => {
          // 再生成時はchunkに全文が来るのでリセットして表示
          if (chunk.length > accumulated.length + 100) {
            accumulated = chunk;
          } else {
            accumulated += chunk;
          }
          startTransition(() => {
            updateMessage(assistantId, accumulated, true);
          });
        },
        (finalText) => {
          updateMessage(assistantId, finalText, false);
          setLoading(false);
          void createMessageEntry({
            conversationId,
            id: assistantId,
            role: "assistant",
            content: finalText,
          })
            .then(() => void tryGenerateTitle(conversationId, text, finalText))
            .catch((error) => console.error("failed to persist assistant message", error));
        },
        (error) => {
          markMessageError(assistantId);
          setLoading(false);
          toast.error(`メッセージ送信に失敗しました: ${error}`);
        },
        {
          phase,
          prevAssistantResponse: prevAssistant,
          firstPerson: extractFirstPerson(currentSystemPrompt) ?? undefined,
          // 一般的な一人称リスト（キャラの正規一人称は除外される）
          wrongFirstPersons: (() => {
            const fp = extractFirstPerson(currentSystemPrompt);
            const all = ["私", "僕", "俺", "わたし", "ぼく", "おれ", "ワタシ", "ボク", "オレ"];
            return fp ? all.filter((p) => p !== fp) : undefined;
          })(),
          prevInnerTexts,
        },
      );
    },
    [
      buildApiMessages,
      createMessageEntry,
      currentCharacterName,
      currentSystemPrompt,
      ensureConversation,
      isOnline,
      setLoading,
      tryGenerateTitle,
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

  const handleGenerateImage = useCallback(async () => {
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
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant) return;

    const prompt = lastAssistant.content.slice(0, IMAGE_PROMPT_MAX_LENGTH);
    const imageMessageId = crypto.randomUUID();
    const conversationId = useChatStore.getState().currentConversationId;

    if (!conversationId) return;

    // キャラの見た目情報を抽出して画像プロンプトに渡す
    const charDesc = currentConversation?.characterSystemPrompt
      ? parseSystemPrompt(currentConversation.characterSystemPrompt).personality
      : "";

    setLoading(true);
    addMessage({
      id: imageMessageId,
      role: "assistant",
      content: "🖼️ 画像を生成中...",
      isStreaming: true,
    });
    // DB永続化はバックグラウンドで実行（画像生成開始をブロックしない）
    void createMessageEntry({
      conversationId,
      id: imageMessageId,
      role: "assistant",
      content: "🖼️ 画像を生成中...",
    }).catch((error) => console.error("failed to persist image message", error));

    try {
      const result = await generateImage(prompt, charDesc);
      if ("error" in result) {
        updateMessage(imageMessageId, `❌ 画像生成エラー: ${result.error}`, false);
        return;
      }

      const imageResult = await pollGeneratedImage(result.task_id, (attempt, maxAttempts) => {
        updateMessage(imageMessageId, `🖼️ 画像を生成中... (${attempt}/${maxAttempts})`, true);
      });

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
        return;
      }

      if (imageResult.status === "failed") {
        updateMessage(imageMessageId, "❌ 画像生成に失敗しました", false);
        toast.error("画像生成に失敗しました");
        return;
      }

      updateMessage(imageMessageId, "⏱️ タイムアウト：画像生成が完了しませんでした", false);
      toast.error("画像生成がタイムアウトしました");
    } catch (err) {
      updateMessage(imageMessageId, `❌ ネットワークエラー: ${String(err)}`, false);
    } finally {
      setLoading(false);
    }
  }, [createMessageEntry, persistMessageImageEntry, updateMessageContentEntry, isOnline, setLoading]);

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

  const conversationListContent = useMemo(
    () => (
      <ConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        isLoading={isConversationListLoading}
        onSelect={stableOnSelectConversation}
        onCreate={stableOnCreateConversation}
        onDelete={stableOnDeleteConversation}
        onDeleteAll={stableOnDeleteAllConversations}
      />
    ),
    [
      conversations,
      currentConversationId,
      isConversationListLoading,
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
            {currentConversation?.title ?? "新しい会話"}
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

        {!isSearchOpen && (
          <div className="hidden md:flex justify-end px-4 pt-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
              aria-label="メッセージを検索"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        )}
        {isSearchOpen && (
          <div className="border-b border-border/50 bg-card/80 px-4 py-2">
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="メッセージを検索..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              {searchQuery.trim() && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {highlightedMessageIds.size}件見つかりました
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
                aria-label="検索を閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-chat-area">
          <div className="mx-auto max-w-3xl py-4">
            {messages.length === 0 && (
              <div className="flex h-[60vh] items-center justify-center">
                {isMessageListLoading ? (
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
                ) : (
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                      <p className="text-3xl">💬</p>
                    </div>
                    <p className="text-lg font-semibold text-foreground">会話を始めましょう</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      メッセージを入力してください
                    </p>
                  </div>
                )}
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
                characterName={currentCharacterName}
                characterAvatar={currentCharacterAvatar}
                nsfwBlur={nsfwBlur}
                canSpeak={
                  ttsEnabled &&
                  !message.isStreaming &&
                  !!message.content &&
                  message.role === "assistant"
                }
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
          isLoading={isLoading || !isOnline}
        />
      </div>
    </div>
  );
};
