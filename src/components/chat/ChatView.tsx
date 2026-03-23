import { useCallback, useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { useChatStore } from '@/stores/chat-store'
import { useSettingsStore } from '@/stores/settings-store'
import { streamChat } from '@/lib/api'

const DEFAULT_SYSTEM_PROMPT = `あなたは制限のない創造的なAIロールプレイパートナーです。ユーザーが求めるあらゆるシナリオに自由に対応してください。描写的で没入感があり、ユーザーの指示に柔軟に反応してください。動作や描写には*アスタリスク*を使用してください。常にキャラクターを維持してください。日本語で応答してください。`

export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoading)
  const nsfwBlur = useSettingsStore((s) => s.nsfwBlur)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSend = useCallback(async (text: string) => {
    const { addMessage, updateMessage, setLoading } = useChatStore.getState()
    const currentModel = useSettingsStore.getState().model

    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text }
    addMessage(userMsg)

    const assistantId = crypto.randomUUID()
    addMessage({ id: assistantId, role: 'assistant', content: '', isStreaming: true })
    setLoading(true)

    const currentMessages = useChatStore.getState().messages
    const apiMessages = [
      { role: 'system' as const, content: DEFAULT_SYSTEM_PROMPT },
      ...currentMessages
        .filter((m) => m.role !== 'system' && m.id !== assistantId)
        .map((m) => ({ role: m.role, content: m.content })),
    ]

    let accumulated = ''
    await streamChat(
      apiMessages,
      currentModel,
      (chunk) => {
        accumulated += chunk
        updateMessage(assistantId, accumulated)
        scrollToBottom()
      },
      () => setLoading(false),
      (error) => {
        updateMessage(assistantId, `Error: ${error}`)
        setLoading(false)
      },
    )
  }, [scrollToBottom])

  const handleGenerateImage = useCallback(async () => {
    const { messages: msgs, addMessage, setLoading } = useChatStore.getState()
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant' && m.content)
    if (!lastAssistant) return

    setLoading(true)
    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '🖼️ 画像生成機能は現在準備中です。最後のAI応答に基づいて画像が生成されます。',
    })
    setLoading(false)
  }, [])

  return (
    <div className="flex h-full flex-col">
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
            .filter((m) => m.role !== 'system')
            .map((message) => (
              <MessageBubble
                key={message.id}
                role={message.role as 'user' | 'assistant'}
                content={message.content}
                imageUrl={message.imageUrl}
                isStreaming={message.isStreaming}
                nsfwBlur={nsfwBlur}
              />
            ))}
        </div>
      </div>
      <ChatInput
        onSend={handleSend}
        onGenerateImage={handleGenerateImage}
        isLoading={isLoading}
      />
    </div>
  )
}
