import { useCallback } from "react";

import { useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createConversation,
  createConversationMessage,
  deleteConversation,
  deleteMessagesAfterMessage,
  listConversationMessages,
  listConversations,
  updateConversationCharacter,
  updateConversationTitle,
  updateMessageContent,
  updateMessageImage as persistMessageImage,
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

  const updateConversationTitleMutation = useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) =>
      updateConversationTitle(conversationId, title),
    onSuccess: (_, { conversationId, title }) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKey.conversationList, (previous) =>
        previous
          ? previous.map((c) => (c.id === conversationId ? { ...c, title } : c))
          : [],
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
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKey.conversationMessageList(input.conversationId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKey.conversationList });
    },
  });

  const persistMessageImageMutation = useMutation({
    mutationFn: persistMessageImage,
    onSuccess: () => {
      if (!currentConversationId) return;
      void queryClient.invalidateQueries({
        queryKey: queryKey.conversationMessageList(currentConversationId),
      });
    },
  });

  const updateMessageContentMutation = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      updateMessageContent(messageId, content),
    onSuccess: () => {
      if (!currentConversationId) return;
      void queryClient.invalidateQueries({
        queryKey: queryKey.conversationMessageList(currentConversationId),
      });
    },
  });

  const deleteMessagesAfterMutation = useMutation({
    mutationFn: ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => deleteMessagesAfterMessage(conversationId, messageId),
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
        imageUrl: row.imageUrl,
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
    updateConversationTitleEntry,
    updateConversationCharacterEntry,
    createMessageEntry,
    persistMessageImageEntry,
    updateMessageContentEntry,
    deleteMessagesAfterEntry,
    loadMessages,
  };
};
