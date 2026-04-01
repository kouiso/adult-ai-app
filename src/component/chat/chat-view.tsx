import { useCallback, useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { CharacterDialog } from "@/component/character/character-dialog";
import { useSpeechSynthesis } from "@/hook/use-speech-synthesis";
import {
  createConversation,
  createConversationMessage,
  generateImage,
  getCharacter,
  getImageTaskResult,
  listConversationMessages,
  listConversations,
  persistImageToR2,
  r2ImageUrl,
  updateMessageImage as persistMessageImage,
  streamChat,
  type Character,
  type ConversationSummary,
} from "@/lib/api";
import {
  DEFAULT_SYSTEM_PROMPT,
  IMAGE_POLL_INTERVAL_MS,
  IMAGE_POLL_MAX_ATTEMPTS,
  IMAGE_PROMPT_MAX_LENGTH,
} from "@/lib/config";
import type { ChatMessage } from "@/store/chat-store";
import { useChatStore } from "@/store/chat-store";
import { useSettingsStore } from "@/store/settings-store";

import { ChatInput } from "./chat-input";
import { ConversationList } from "./conversation-list";
import { MessageBubble } from "./message-bubble";

const CONVERSATION_QUERY_KEY = ["conversation-list"] as const;

const conversationMessageQueryKey = (conversationId: string) =>
  ["conversation-message-list", conversationId] as const;

const characterQueryKey = (characterId: string) => ["character", characterId] as const;

type ImagePollingResult =
  | { status: "succeeded"; imageUrl: string }
  | { status: "failed" }
  | { status: "timeout" };

const pollGeneratedImage = async (taskId: string): Promise<ImagePollingResult> => {
  for (let i = 0; i < IMAGE_POLL_MAX_ATTEMPTS; i++) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, IMAGE_POLL_INTERVAL_MS);
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
  const nsfwBlur = useSettingsStore((s) => s.nsfwBlur);
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
  const [showCharacterDialog, setShowCharacterDialog] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<Character | null>(null);
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: CONVERSATION_QUERY_KEY,
    queryFn: listConversations,
  });

  const createConversationMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationSummary[]>(CONVERSATION_QUERY_KEY, (previous) =>
        previous ? [conversation, ...previous] : [conversation],
      );
    },
  });

  const createConversationMessageMutation = useMutation({
    mutationFn: createConversationMessage,
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({
        queryKey: conversationMessageQueryKey(input.conversationId),
      });
      void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEY });
    },
  });

  const persistMessageImageMutation = useMutation({
    mutationFn: persistMessageImage,
    onSuccess: () => {
      if (!currentConversationId) return;
      void queryClient.invalidateQueries({
        queryKey: conversationMessageQueryKey(currentConversationId),
      });
    },
  });

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

  const loadCharacter = useCallback(
    async (characterId: string) => {
      const character = await queryClient.fetchQuery({
        queryKey: characterQueryKey(characterId),
        queryFn: () => getCharacter(characterId),
        staleTime: 5 * 60 * 1000,
      });
      setCurrentCharacter(character);
    },
    [queryClient],
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const rows = await queryClient.fetchQuery({
        queryKey: conversationMessageQueryKey(conversationId),
        queryFn: () => listConversationMessages(conversationId),
      });
      const nextMessages: ChatMessage[] = rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        // R2に永続化された画像があればそちらを優先
        imageUrl: row.imageKey ? r2ImageUrl(row.imageKey) : row.imageUrl,
      }));
      setMessages(nextMessages);
    },
    [queryClient, setMessages],
  );

  const ensureConversation = useCallback(async (): Promise<string> => {
    const currentId = useChatStore.getState().currentConversationId;
    if (currentId) return currentId;

    if (conversations.length > 0) {
      const first = conversations[0];
      setConversationId(first.id);
      await loadMessages(first.id);
      await loadCharacter(first.characterId);
      return first.id;
    }

    const created = await createConversationMutation.mutateAsync(undefined);
    setConversationId(created.id);
    setMessages([]);
    await loadCharacter(created.characterId);
    return created.id;
  }, [
    conversations,
    createConversationMutation,
    loadCharacter,
    loadMessages,
    setConversationId,
    setMessages,
  ]);

  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      try {
        if (currentConversationId) return;
        const listed = conversations;
        if (!alive) return;

        if (listed.length === 0) {
          const created = await createConversationMutation.mutateAsync(undefined);
          if (!alive) return;
          setConversationId(created.id);
          setMessages([]);
          await loadCharacter(created.characterId);
          return;
        }

        setConversationId(listed[0].id);
        await loadMessages(listed[0].id);
        await loadCharacter(listed[0].characterId);
      } catch {
        toast.error("会話の初期化に失敗しました");
      }
    };

    void bootstrap();
    return () => {
      alive = false;
    };
  }, [
    conversations,
    createConversationMutation,
    currentConversationId,
    loadCharacter,
    loadMessages,
    setConversationId,
    setMessages,
  ]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      setConversationId(conversationId);
      setMessages([]);
      try {
        await loadMessages(conversationId);
        const conversation = conversations.find((c) => c.id === conversationId);
        if (conversation) {
          await loadCharacter(conversation.characterId);
        }
      } catch {
        toast.error("会話の読み込みに失敗しました");
      }
    },
    [conversations, loadCharacter, loadMessages, setConversationId, setMessages],
  );

  const handleCreateConversation = useCallback(() => {
    setShowCharacterDialog(true);
  }, []);

  const handleCharacterSelected = useCallback(
    async (characterId: string) => {
      try {
        const created = await createConversationMutation.mutateAsync({ characterId });
        setConversationId(created.id);
        setMessages([]);
        await loadCharacter(characterId);

        // グリーティングメッセージがあればアシスタントメッセージとして追加
        const character = queryClient.getQueryData<Character>(characterQueryKey(characterId));
        if (character?.greeting) {
          const greetingId = crypto.randomUUID();
          useChatStore.getState().addMessage({
            id: greetingId,
            role: "assistant",
            content: character.greeting,
          });
          await createConversationMessageMutation.mutateAsync({
            conversationId: created.id,
            id: greetingId,
            role: "assistant",
            content: character.greeting,
          });
        }
      } catch {
        toast.error("会話の作成に失敗しました");
      }
    },
    [
      createConversationMutation,
      createConversationMessageMutation,
      loadCharacter,
      queryClient,
      setConversationId,
      setMessages,
    ],
  );

  const handleGenerateImage = useCallback(async () => {
    const {
      messages: msgs,
      addMessage,
      updateMessage,
      updateMessageImage,
      setLoading,
    } = useChatStore.getState();
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant) return;

    const prompt = lastAssistant.content.slice(0, IMAGE_PROMPT_MAX_LENGTH);
    const imageMessageId = crypto.randomUUID();
    const conversationId = useChatStore.getState().currentConversationId;

    if (!conversationId) return;

    setLoading(true);
    addMessage({
      id: imageMessageId,
      role: "assistant",
      content: "🖼️ 画像を生成中...",
      isStreaming: true,
    });
    await createConversationMessageMutation.mutateAsync({
      conversationId,
      id: imageMessageId,
      role: "assistant",
      content: "🖼️ 画像を生成中...",
    });
    scrollToBottom();

    try {
      const result = await generateImage(prompt);
      if ("error" in result) {
        updateMessage(imageMessageId, `❌ 画像生成エラー: ${result.error}`, false);
        return;
      }

      const imageResult = await pollGeneratedImage(result.task_id);

      if (imageResult.status === "succeeded") {
        updateMessage(imageMessageId, "", false);
        updateMessageImage(imageMessageId, imageResult.imageUrl);
        await persistMessageImageMutation.mutateAsync({
          messageId: imageMessageId,
          imageUrl: imageResult.imageUrl,
        });

        // R2に永続化（TTL付きURLの期限切れ対策）
        try {
          const imageKey = await persistImageToR2({
            imageUrl: imageResult.imageUrl,
            messageId: imageMessageId,
          });
          updateMessageImage(imageMessageId, r2ImageUrl(imageKey));
        } catch (error) {
          // R2永続化失敗はクリティカルではないのでNovita URLのまま（系統的障害検知のためログは残す）
          console.warn("R2 persist failed:", error);
        }

        scrollToBottom();
        return;
      }

      if (imageResult.status === "failed") {
        updateMessage(imageMessageId, "❌ 画像生成に失敗しました", false);
        return;
      }

      updateMessage(imageMessageId, "⏱️ タイムアウト：画像生成が完了しませんでした", false);
    } catch (err) {
      updateMessage(imageMessageId, `❌ ネットワークエラー: ${String(err)}`, false);
    } finally {
      setLoading(false);
    }
  }, [createConversationMessageMutation, persistMessageImageMutation, scrollToBottom]);

  const handleSend = useCallback(
    async (text: string) => {
      const { addMessage, updateMessage, setLoading } = useChatStore.getState();
      const currentModel = useSettingsStore.getState().model;
      const conversationId = await ensureConversation();

      // キャラクターのsystemPromptを使用、なければデフォルト
      const systemPrompt = currentCharacter?.systemPrompt || DEFAULT_SYSTEM_PROMPT;

      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: text,
      };
      addMessage(userMsg);
      await createConversationMessageMutation.mutateAsync({
        conversationId,
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
      });

      const assistantId = crypto.randomUUID();
      addMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      });
      setLoading(true);

      const currentMessages = useChatStore.getState().messages;
      const filtered = currentMessages.filter((m) => m.role !== "system" && m.id !== assistantId);
      const LANG_REMINDER = "\n\n(必ず日本語のみで返答すること。他の言語を一切使わないこと)";
      // 最後のuserメッセージのインデックスを事前計算（O(n)で済ませる）
      let lastUserIndex = -1;
      for (let i = filtered.length - 1; i >= 0; i--) {
        if (filtered[i].role === "user") {
          lastUserIndex = i;
          break;
        }
      }
      const apiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...filtered.map((m, i) => ({
          role: m.role,
          content: i === lastUserIndex ? m.content + LANG_REMINDER : m.content,
        })),
      ];

      let accumulated = "";
      await streamChat(
        apiMessages,
        currentModel,
        (chunk) => {
          accumulated += chunk;
          updateMessage(assistantId, accumulated, true);
          scrollToBottom();
        },
        () => {
          void (async () => {
            updateMessage(assistantId, accumulated, false);
            try {
              await createConversationMessageMutation.mutateAsync({
                conversationId,
                id: assistantId,
                role: "assistant",
                content: accumulated,
              });
            } catch {
              toast.error("メッセージの保存に失敗しました");
            }
            setLoading(false);

            if (useSettingsStore.getState().autoGenerateImages) {
              void handleGenerateImage();
            }
          })();
        },
        (error) => {
          updateMessage(assistantId, `Error: ${error}`, false);
          setLoading(false);
        },
      );
    },
    [
      createConversationMessageMutation,
      currentCharacter,
      ensureConversation,
      handleGenerateImage,
      scrollToBottom,
    ],
  );

  const characterName = currentCharacter?.name ?? "AI";

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelect={(conversationId) => void handleSelectConversation(conversationId)}
        onCreate={handleCreateConversation}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl py-4">
            {messages.length === 0 && (
              <div className="flex h-[60vh] items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <p className="text-2xl mb-2">💬</p>
                  <p className="text-lg font-medium">会話を始めましょう</p>
                  <p className="text-sm">メッセージを入力してください</p>
                </div>
              </div>
            )}
            {messages
              .filter(
                (m): m is ChatMessage & { role: "user" | "assistant" } =>
                  m.role === "user" || m.role === "assistant",
              )
              .map((message) => (
                <MessageBubble
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  imageUrl={message.imageUrl}
                  isStreaming={message.isStreaming}
                  characterName={characterName}
                  nsfwBlur={nsfwBlur}
                  canSpeak={
                    ttsEnabled &&
                    !message.isStreaming &&
                    !!message.content &&
                    message.role === "assistant"
                  }
                  isSpeaking={speakingMessageId === message.id && isSpeaking}
                  onSpeak={(text: string) => {
                    setSpeakingMessageId(message.id);
                    speak(text);
                  }}
                  onStopSpeaking={() => {
                    stop();
                    setSpeakingMessageId(null);
                  }}
                />
              ))}
          </div>
        </div>
        <ChatInput
          onSend={(msg) => void handleSend(msg)}
          onGenerateImage={() => void handleGenerateImage()}
          isLoading={isLoading}
        />
      </div>
      <CharacterDialog
        open={showCharacterDialog}
        onOpenChange={setShowCharacterDialog}
        onSelect={(characterId) => void handleCharacterSelected(characterId)}
      />
    </div>
  );
};
