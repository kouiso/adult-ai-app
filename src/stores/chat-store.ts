import { create } from 'zustand'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  imageUrl?: string
  isStreaming?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  currentConversationId: string | null
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, content: string) => void
  setMessages: (messages: ChatMessage[]) => void
  setLoading: (loading: boolean) => void
  setConversationId: (id: string | null) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  currentConversationId: null,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content, isStreaming: false } : m
      ),
    })),
  setMessages: (messages) => set({ messages }),
  setLoading: (isLoading) => set({ isLoading }),
  setConversationId: (id) => set({ currentConversationId: id }),
  clearMessages: () => set({ messages: [] }),
}))
