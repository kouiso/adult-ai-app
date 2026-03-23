import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  imageUrl?: string;
  isStreaming?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  currentConversationId: string | null;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, content: string, isStreaming?: boolean) => void;
  updateMessageImage: (id: string, imageUrl: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setLoading: (loading: boolean) => void;
  setConversationId: (id: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  currentConversationId: null,
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content, isStreaming = false) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content, isStreaming } : m)),
    })),
  updateMessageImage: (id, imageUrl) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, imageUrl } : m)),
    })),
  setMessages: (messages) => set({ messages }),
  setLoading: (isLoading) => set({ isLoading }),
  setConversationId: (id) => set({ currentConversationId: id }),
  clearMessages: () => set({ messages: [] }),
}));
