export const queryKey = {
  conversationList: ["conversation-list"] as const,
  conversationMessageList: (conversationId: string) =>
    ["conversation-message-list", conversationId] as const,
  characterList: ["character-list"] as const,
};
