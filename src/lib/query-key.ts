export const queryKey = {
  conversationList: ["conversation-list"] as const,
  conversationMessageList: (conversationId: string) =>
    ["conversation-message-list", conversationId] as const,
  messageSearch: (query: string) => ["message-search", query] as const,
  characterList: ["character-list"] as const,
};
