import { memo, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Pencil, RefreshCw, RotateCcw, Volume2, VolumeOff } from "lucide-react";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { Avatar, AvatarFallback, AvatarImage } from "@/component/ui/avatar";
import { isXmlResponse, parseXmlResponse } from "@/lib/xml-response-parser";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  isStreaming?: boolean;
  isLoading?: boolean;
  characterName?: string;
  characterAvatar?: string | null;
  nsfwBlur?: boolean;
  canSpeak?: boolean;
  isSpeaking?: boolean;
  error?: boolean;
  isLast?: boolean;
  isHighlighted?: boolean;
  onSpeak?: (messageId: string, text: string) => void;
  onStopSpeaking?: () => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onRetry?: (messageId: string) => void;
}

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
  role?: "user" | "assistant";
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
// レンダー毎の配列再生成を防ぎ、ReactMarkdownのプラグイン再初期化をスキップさせる
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize];

// アシスタント応答を「台詞」「(ト書き)」「地の文」に分割してスタイル付与
const StyledNarrative = memo(({ content }: { content: string }) => {
  const segments = content.split(/(「[^」]*」|\([^)]*\))/g).filter(Boolean);
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.startsWith("(") && seg.endsWith(")")) {
          return (
            <span key={i} className="italic text-muted-foreground/70 text-[0.85em]">
              {seg}
            </span>
          );
        }
        if (seg.startsWith("「") && seg.endsWith("」")) {
          return (
            <span key={i} className="font-medium">
              {seg}
            </span>
          );
        }
        return <span key={i}>{seg}</span>;
      })}
    </span>
  );
});
StyledNarrative.displayName = "StyledNarrative";

// XML構造化レスポンス用レンダラー
// <action>/<dialogue>/<inner>を視覚的に分離して表示
const StructuredNarrative = memo(({ content }: { content: string }) => {
  const parsed = parseXmlResponse(content);
  if (!parsed) {
    // XMLパース失敗時は既存レンダラーにフォールバック
    const paragraphs = content.split(/\n+/).filter(Boolean);
    return (
      <>
        {paragraphs.map((para, i) => (
          <p key={i} className="mb-2 last:mb-0">
            <StyledNarrative content={para} />
          </p>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-1.5">
      {parsed.narration && (
        <p className="italic text-muted-foreground/70 leading-relaxed text-sm">
          {parsed.narration}
        </p>
      )}
      {parsed.action && (
        <p className="italic text-muted-foreground/80 leading-relaxed">
          {parsed.action}
        </p>
      )}
      {parsed.dialogue && (
        <p className="font-medium leading-relaxed">
          <StyledNarrative content={parsed.dialogue} />
        </p>
      )}
      {parsed.inner && (
        <p className="text-xs italic text-muted-foreground/60 leading-relaxed">
          {parsed.inner}
        </p>
      )}
    </div>
  );
});
StructuredNarrative.displayName = "StructuredNarrative";

// ストリーミング中はReactMarkdownのフルパースを避けて生テキスト表示にする
// ReactMarkdown+remarkGfmはチャンク毎に数十msメインスレッドをブロックするため
const StreamingContent = memo(({ content }: { content: string }) => {
  if (!content) {
    return (
      <div className="flex gap-1">
        <span className="animate-bounce text-xs text-primary/60">●</span>
        <span className="animate-bounce text-xs text-primary/60 [animation-delay:0.2s]">●</span>
        <span className="animate-bounce text-xs text-primary/60 [animation-delay:0.4s]">●</span>
      </div>
    );
  }
  return <span className="whitespace-pre-wrap">{content}</span>;
});

StreamingContent.displayName = "StreamingContent";

const MessageContent = memo(({ content, isStreaming, role }: MessageContentProps) => {
  if (isStreaming) {
    return <StreamingContent content={content} />;
  }
  if (!content) return null;

  // アシスタントの応答: XML構造化 or 既存フォーマットで表示
  if (role === "assistant") {
    if (isXmlResponse(content)) {
      return <StructuredNarrative content={content} />;
    }
    const paragraphs = content.split(/\n+/).filter(Boolean);
    return (
      <>
        {paragraphs.map((para, i) => (
          <p key={i} className="mb-2 last:mb-0">
            <StyledNarrative content={para} />
          </p>
        ))}
      </>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
});

MessageContent.displayName = "MessageContent";

interface SpeakButtonProps {
  messageId: string;
  isSpeaking: boolean;
  content: string;
  onSpeak?: (messageId: string, text: string) => void;
  onStopSpeaking?: () => void;
}

const SpeakButton = ({
  messageId,
  isSpeaking,
  content,
  onSpeak,
  onStopSpeaking,
}: SpeakButtonProps) => (
  <button
    type="button"
    onClick={() => (isSpeaking ? onStopSpeaking?.() : onSpeak?.(messageId, content))}
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

// 画像生成APIのドメインのみ許可し、外部サイトからの意図しないリクエストを防ぐ
const ALLOWED_IMAGE_HOSTS = new Set([
  "image.novita.ai",
  "novita.ai",
  "faas-output-image.s3.ap-southeast-1.amazonaws.com",
  "novita-output.s3.amazonaws.com",
]);

const isValidImageUrl = (url: string): boolean => {
  if (url.startsWith("/api/image/r2/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
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

// ── アバター画像ビューワー ──────────────────────────────────────────────
interface AvatarViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const AvatarViewer = ({ src, alt, onClose }: AvatarViewerProps) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt}の画像`}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
      />
    </div>
  );
};

interface MessageAvatarProps {
  isUser: boolean;
  characterName: string;
  avatarUrl?: string | null;
  onAvatarClick?: () => void;
}

const MessageAvatar = ({ isUser, characterName, avatarUrl, onAvatarClick }: MessageAvatarProps) => {
  const clickable = !isUser && !!avatarUrl;
  return (
    <Avatar
      className={cn("h-8 w-8 shrink-0", clickable && "cursor-pointer ring-offset-background transition-all hover:ring-2 hover:ring-primary/40 hover:ring-offset-1")}
      onClick={clickable ? onAvatarClick : undefined}
    >
      {!isUser && avatarUrl && <AvatarImage src={avatarUrl} alt={characterName} />}
      <AvatarFallback
        className={cn(
          "text-xs font-medium",
          isUser ? "bg-gradient-user-bubble text-white" : "bg-accent text-accent-foreground",
        )}
      >
        {isUser ? "あなた" : characterName.slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  );
};

// ── ユーザーメッセージのインライン編集 ─────────────────────────────────────
interface UserEditFormProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

const UserEditForm = ({ initialContent, onSave, onCancel }: UserEditFormProps) => {
  const [value, setValue] = useState(initialContent);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // ChatInputと統一: Ctrl+Enter(またはCmd+Enter)��送信
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
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

// ── エラー表示 ───────────────────────────────────────────────────────────
interface ErrorIndicatorProps {
  messageId: string;
  onRetry?: (messageId: string) => void;
}

const ErrorIndicator = ({ messageId, onRetry }: ErrorIndicatorProps) => (
  <div className="flex items-center gap-2 text-destructive">
    <span className="text-xs font-medium">送信エラー</span>
    {onRetry && (
      <button
        type="button"
        onClick={() => onRetry(messageId)}
        className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
        aria-label="再試行"
      >
        <RotateCcw className="h-3 w-3" />
        再試行
      </button>
    )}
  </div>
);

// ── アクションボタン群 ───────────────────────────────────────────────────
interface MessageActionsProps {
  id: string;
  isUser: boolean;
  isLoading: boolean;
  isLast: boolean;
  canSpeak: boolean;
  isSpeaking: boolean;
  content: string;
  onSpeak?: (messageId: string, text: string) => void;
  onStopSpeaking?: () => void;
  onRegenerate?: (messageId: string) => void;
  onStartEdit: () => void;
  hasEditHandler: boolean;
}

const MessageActions = ({
  id,
  isUser,
  isLoading,
  isLast,
  canSpeak,
  isSpeaking,
  content,
  onSpeak,
  onStopSpeaking,
  onRegenerate,
  onStartEdit,
  hasEditHandler,
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", isUser ? "justify-end" : "justify-start")}>
    {canSpeak && (
      <SpeakButton
        messageId={id}
        isSpeaking={isSpeaking}
        content={content}
        onSpeak={onSpeak}
        onStopSpeaking={onStopSpeaking}
      />
    )}
    {isUser && !isLoading && hasEditHandler && (
      <button
        type="button"
        onClick={onStartEdit}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="メッセージを編集"
      >
        <Pencil className="h-3.5 w-3.5" />
        編集
      </button>
    )}
    {!isUser && isLast && !isLoading && onRegenerate && content && (
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
);

export const MessageBubble = memo(
  ({
    id,
    role,
    content,
    imageUrl,
    isStreaming,
    isLoading = false,
    error = false,
    characterName = "AI",
    characterAvatar,
    nsfwBlur = false,
    canSpeak = false,
    isSpeaking = false,
    isLast = false,
    isHighlighted = false,
    onSpeak,
    onStopSpeaking,
    onRegenerate,
    onEdit,
    onRetry,
  }: MessageBubbleProps) => {
    const isUser = role === "user";
    const [isEditing, setIsEditing] = useState(false);
    const [showAvatarViewer, setShowAvatarViewer] = useState(false);
    const bubbleStyle = isUser
      ? "bg-gradient-user-bubble text-white rounded-tr-sm shadow-sm"
      : "bg-card text-foreground rounded-tl-sm border border-border/50 shadow-sm";

    const handleEditSave = useCallback(
      (newContent: string) => {
        setIsEditing(false);
        onEdit?.(id, newContent);
      },
      [id, onEdit],
    );

    return (
      <div className={cn("flex gap-3 px-4 py-3 group/message", isUser && "flex-row-reverse")}>
        <MessageAvatar isUser={isUser} characterName={characterName} avatarUrl={characterAvatar} onAvatarClick={() => setShowAvatarViewer(true)} />
        <div className={cn("max-w-[75%] space-y-2", isUser && "text-right")}>
          {isEditing ? (
            <UserEditForm
              initialContent={content}
              onSave={handleEditSave}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <div
              className={cn(
                "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                bubbleStyle,
                isHighlighted && "ring-2 ring-yellow-400/50 bg-yellow-50/10",
              )}
            >
              <MessageContent content={content} isStreaming={isStreaming} role={role} />
            </div>
          )}

          {error && !isUser && !isEditing && <ErrorIndicator messageId={id} onRetry={onRetry} />}

          {!isStreaming && !isEditing && !error && (
            <MessageActions
              id={id}
              isUser={isUser}
              isLoading={isLoading}
              isLast={isLast}
              canSpeak={canSpeak}
              isSpeaking={isSpeaking}
              content={content}
              onSpeak={onSpeak}
              onStopSpeaking={onStopSpeaking}
              onRegenerate={onRegenerate}
              onStartEdit={() => setIsEditing(true)}
              hasEditHandler={!!onEdit}
            />
          )}

          {imageUrl && <ImagePreview imageUrl={imageUrl} nsfwBlur={nsfwBlur} />}
        </div>

        {showAvatarViewer && characterAvatar && (
          <AvatarViewer
            src={characterAvatar}
            alt={characterName}
            onClose={() => setShowAvatarViewer(false)}
          />
        )}
      </div>
    );
  },
);

MessageBubble.displayName = "MessageBubble";
