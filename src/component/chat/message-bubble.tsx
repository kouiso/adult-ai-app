import { useCallback, useState } from "react";

import { Pencil, RefreshCw, Volume2, VolumeOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Avatar, AvatarFallback } from "@/component/ui/avatar";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  isStreaming?: boolean;
  characterName?: string;
  nsfwBlur?: boolean;
  canSpeak?: boolean;
  isSpeaking?: boolean;
  isLast?: boolean;
  onSpeak?: (text: string) => void;
  onStopSpeaking?: () => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
}

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

const markdownParagraph = ({ children }: { children?: React.ReactNode }) => (
  <p className="mb-2 last:mb-0">{children}</p>
);
const markdownEm = ({ children }: { children?: React.ReactNode }) => (
  <em className="italic text-muted-foreground">{children}</em>
);
const markdownStrong = ({ children }: { children?: React.ReactNode }) => (
  <strong className="font-semibold">{children}</strong>
);
const markdownComponents = { p: markdownParagraph, em: markdownEm, strong: markdownStrong };

const MessageContent = ({ content, isStreaming }: MessageContentProps) => {
  if (content) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    );
  }
  if (isStreaming) {
    return (
      <div className="flex gap-1">
        <span className="animate-bounce text-xs">●</span>
        <span className="animate-bounce text-xs [animation-delay:0.2s]">●</span>
        <span className="animate-bounce text-xs [animation-delay:0.4s]">●</span>
      </div>
    );
  }
  return null;
};

interface SpeakButtonProps {
  isSpeaking: boolean;
  content: string;
  onSpeak?: (text: string) => void;
  onStopSpeaking?: () => void;
}

const SpeakButton = ({ isSpeaking, content, onSpeak, onStopSpeaking }: SpeakButtonProps) => (
  <button
    type="button"
    onClick={() => (isSpeaking ? onStopSpeaking?.() : onSpeak?.(content))}
    className={cn(
      "flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors",
      isSpeaking
        ? "bg-primary/10 text-primary hover:bg-primary/20"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    )}
  >
    {isSpeaking ? <VolumeOff className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    {isSpeaking ? "停止" : "再生"}
  </button>
);

const isValidImageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

interface ImagePreviewProps {
  imageUrl: string;
  nsfwBlur: boolean;
}

const ImagePreview = ({ imageUrl, nsfwBlur }: ImagePreviewProps) => {
  const [revealed, setRevealed] = useState(false);

  if (!isValidImageUrl(imageUrl)) {
    return null;
  }

  if (!nsfwBlur || revealed) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <img src={imageUrl} alt="Generated" className="max-w-full rounded-xl" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="relative cursor-pointer overflow-hidden rounded-xl"
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setRevealed(true);
      }}
    >
      <img
        src={imageUrl}
        alt="Generated"
        className="max-w-full rounded-xl blur-xl transition-all duration-300"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
        <span className="text-white text-xs">タップで表示</span>
      </div>
    </button>
  );
};

interface MessageAvatarProps {
  isUser: boolean;
  characterName: string;
}

const MessageAvatar = ({ isUser, characterName }: MessageAvatarProps) => (
  <Avatar className="h-8 w-8 shrink-0">
    <AvatarFallback
      className={cn(
        "text-xs",
        isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
      )}
    >
      {isUser ? "あなた" : characterName.slice(0, 2)}
    </AvatarFallback>
  </Avatar>
);

// ── ユーザーメッセージのインライン編集 ─────────────────────────────────────
interface UserEditFormProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

const UserEditForm = ({ initialContent, onSave, onCancel }: UserEditFormProps) => {
  const [value, setValue] = useState(initialContent);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSave(value.trim());
    }
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-primary bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        rows={Math.min(8, value.split("\n").length + 1)}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => value.trim() && onSave(value.trim())}
          disabled={!value.trim()}
          className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          送信
        </button>
      </div>
    </div>
  );
};

export const MessageBubble = ({
  id,
  role,
  content,
  imageUrl,
  isStreaming,
  characterName = "AI",
  nsfwBlur = false,
  canSpeak = false,
  isSpeaking = false,
  isLast = false,
  onSpeak,
  onStopSpeaking,
  onRegenerate,
  onEdit,
}: MessageBubbleProps) => {
  const isUser = role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const bubbleStyle = isUser
    ? "bg-primary text-primary-foreground rounded-tr-sm"
    : "bg-muted text-foreground rounded-tl-sm";

  const handleEditSave = useCallback(
    (newContent: string) => {
      setIsEditing(false);
      onEdit?.(id, newContent);
    },
    [id, onEdit],
  );

  return (
    <div className={cn("flex gap-3 px-4 py-3 group/message", isUser && "flex-row-reverse")}>
      <MessageAvatar isUser={isUser} characterName={characterName} />
      <div className={cn("max-w-[75%] space-y-2", isUser && "text-right")}>
        {isEditing ? (
          <UserEditForm
            initialContent={content}
            onSave={handleEditSave}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div className={cn("rounded-2xl px-4 py-2.5 text-sm leading-relaxed", bubbleStyle)}>
            <MessageContent content={content} isStreaming={isStreaming} />
          </div>
        )}

        {/* アクションボタン群 */}
        {!isStreaming && !isEditing && (
          <div
            className={cn(
              "flex items-center gap-1",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            {canSpeak && (
              <SpeakButton
                isSpeaking={isSpeaking}
                content={content}
                onSpeak={onSpeak}
                onStopSpeaking={onStopSpeaking}
              />
            )}
            {isUser && onEdit && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="メッセージを編集"
              >
                <Pencil className="h-3.5 w-3.5" />
                編集
              </button>
            )}
            {!isUser && isLast && onRegenerate && content && (
              <button
                type="button"
                onClick={() => onRegenerate(id)}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="再生成"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                再生成
              </button>
            )}
          </div>
        )}

        {imageUrl && <ImagePreview imageUrl={imageUrl} nsfwBlur={nsfwBlur} />}
      </div>
    </div>
  );
};
