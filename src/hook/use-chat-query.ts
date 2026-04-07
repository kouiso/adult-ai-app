import { useCallback } from "react";

import { useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createConversation,
  createConversationMessage,
  deleteAllConversations,
  deleteConversation,
  deleteMessagesAfterMessage,
  listConversationMessages,
  listConversations,
  updateMessageImage as persistMessageImage,
  updateConversationCharacter,
  updateConversationTitle,
  updateMessageContent,
  type ConversationSummary,
} from "@/lib/api";
import { queryKey } from "@/lib/query-key";
import type { ChatMessage } from "@/store/chat-store";

export const useChatQuery = (currentConversationId: string | null) => {
  const queryClient = useQueryClient();

  const {
    data: conversations = [],
    isPending: isConversationListPending,
    isFetching: isConversationListFetching,
  } = useQuery({
    queryKey: queryKey.conversationList,
    queryFn: listConversations,
  });

  const isMessageListFetching =
    useIsFetching({
      queryKey: currentConversationId
        ? queryKey.conversationMessageList(currentConversationId)
        : undefined,
    }) > 0;

  const createConversationMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKey.conversationList, (previous) =>
        previous ? [conversation, ...previous] : [conversation],
      );
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, conversationId) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKey.conversationList, (previous) =>
        previous ? previous.filter((c) => c.id !== conversationId) : [],
      );
      queryClient.removeQueries({
        queryKey: queryKey.conversationMessageList(conversationId),
      });
    },
  });

  const deleteAllConversationsMutation = useMutation({
    mutationFn: deleteAllConversations,
    onSuccess: () => {
      queryClient.setQueryData<ConversationSummary[]>(queryKey.conversationList, []);
      queryClient.removeQueries({ queryKey: ["conversationMessages"] });
    },
  });

  const updateConversationTitleMutation = useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) =>
      updateConversationTitle(conversationId, title),
    onSuccess: (_, { conversationId, title }) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKey.conversationList, (previous) =>
        previous ? previous.map((c) => (c.id === conversationId ? { ...c, title } : c)) : [],
      );
    },
  });

  const updateConversationCharacterMutation = useMutation({
    mutationFn: ({
      conversationId,
      characterId,
    }: {
      conversationId: string;
      characterId: string;
    }) => updateConversationCharacter(conversationId, characterId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKey.conversationList });
    },
  });

  const createConversationMessageMutation = useMutation({
    mutationFn: createConversationMessage,
    // メッセージ作成時にconversationListをinvalidateすると全会話リストのrefetchが走る
    // メッセージリストのinvalidateも不要（Zustandストア側でリアルタイム管理している）
  });

  const persistMessageImageMutation = useMutation({
    mutationFn: persistMessageImage,
    // Zustandストア側でリアルタイム管理しているためinvalidate不要
  });

  const updateMessageContentMutation = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      updateMessageContent(messageId, content),
    // Zustandストア側でリアルタイム管理しているためinvalidate不要
  });

  const deleteMessagesAfterMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      deleteMessagesAfterMessage(conversationId, messageId),
    onSuccess: (_, { conversationId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKey.conversationMessageList(conversationId),
      });
    },
  });

  const createConversationEntry = useCallback(
    async (input?: { title?: string; characterId?: string }) =>
      createConversationMutation.mutateAsync(input),
    [createConversationMutation],
  );

  const deleteConversationEntry = useCallback(
    async (conversationId: string) => deleteConversationMutation.mutateAsync(conversationId),
    [deleteConversationMutation],
  );

  const deleteAllConversationsEntry = useCallback(
    async () => deleteAllConversationsMutation.mutateAsync(),
    [deleteAllConversationsMutation],
  );

  const updateConversationTitleEntry = useCallback(
    async (conversationId: string, title: string) =>
      updateConversationTitleMutation.mutateAsync({ conversationId, title }),
    [updateConversationTitleMutation],
  );

  const updateConversationCharacterEntry = useCallback(
    async (conversationId: string, characterId: string) =>
      updateConversationCharacterMutation.mutateAsync({ conversationId, characterId }),
    [updateConversationCharacterMutation],
  );

  const createMessageEntry = useCallback(
    async (input: {
      conversationId: string;
      id: string;
      role: "system" | "user" | "assistant";
      content: string;
      imageUrl?: string;
      imageKey?: string;
    }) => {
      await createConversationMessageMutation.mutateAsync(input);
    },
    [createConversationMessageMutation],
  );

  const persistMessageImageEntry = useCallback(
    async (input: { messageId: string; imageUrl?: string; imageKey?: string }) => {
      await persistMessageImageMutation.mutateAsync(input);
    },
    [persistMessageImageMutation],
  );

  const updateMessageContentEntry = useCallback(
    async (messageId: string, content: string) =>
      updateMessageContentMutation.mutateAsync({ messageId, content }),
    [updateMessageContentMutation],
  );

  const deleteMessagesAfterEntry = useCallback(
    async (conversationId: string, messageId: string) =>
      deleteMessagesAfterMutation.mutateAsync({ conversationId, messageId }),
    [deleteMessagesAfterMutation],
  );

  const loadMessages = useCallback(
    async (conversationId: string): Promise<ChatMessage[]> => {
      const rows = await queryClient.fetchQuery({
        queryKey: queryKey.conversationMessageList(conversationId),
        queryFn: () => listConversationMessages(conversationId),
      });
      return rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        // nullはundefinedに変換（ChatMessage型はstring|undefinedのみ許容するため）
        imageUrl: row.imageUrl ?? undefined,
      }));
    },
    [queryClient],
  );

  return {
    conversations,
    isConversationListLoading: isConversationListPending || isConversationListFetching,
    isMessageListLoading: isMessageListFetching,
    createConversationEntry,
    deleteConversationEntry,
    deleteAllConversationsEntry,
    updateConversationTitleEntry,
    updateConversationCharacterEntry,
    createMessageEntry,
    persistMessageImageEntry,
    updateMessageContentEntry,
    deleteMessagesAfterEntry,
    loadMessages,
  };
};
