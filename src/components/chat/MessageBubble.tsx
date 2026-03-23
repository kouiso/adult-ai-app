import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  isStreaming?: boolean
  characterName?: string
  nsfwBlur?: boolean
}

export function MessageBubble({
  role,
  content,
  imageUrl,
  isStreaming,
  characterName = 'AI',
  nsfwBlur = false,
}: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex gap-3 px-4 py-3', isUser && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(
          'text-xs',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
        )}>
          {isUser ? 'あなた' : characterName.slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      <div className={cn('max-w-[75%] space-y-2', isUser && 'text-right')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}
        >
          {content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              }}
            >
              {content}
            </ReactMarkdown>
          ) : isStreaming ? (
            <div className="flex gap-1">
              <span className="animate-bounce text-xs">●</span>
              <span className="animate-bounce text-xs [animation-delay:0.2s]">●</span>
              <span className="animate-bounce text-xs [animation-delay:0.4s]">●</span>
            </div>
          ) : null}
        </div>
        {imageUrl && (
          <div className={cn('relative overflow-hidden rounded-xl', nsfwBlur && 'group cursor-pointer')}>
            <img
              src={imageUrl}
              alt="Generated"
              className={cn(
                'max-w-full rounded-xl transition-all duration-300',
                nsfwBlur && 'blur-xl group-hover:blur-none'
              )}
            />
            {nsfwBlur && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:opacity-0 transition-opacity">
                <span className="text-white text-xs">クリックで表示</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
