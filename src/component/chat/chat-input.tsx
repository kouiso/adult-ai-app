import { memo, useCallback, useRef, useState } from "react";

import { ImagePlus, LoaderCircle, SendHorizontal } from "lucide-react";

import { Button } from "@/component/ui/button";
import { Textarea } from "@/component/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/component/ui/tooltip";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>;
  onGenerateImage: () => void | Promise<void>;
  isLoading: boolean;
  isGeneratingImage: boolean;
}

export const ChatInput = memo(
  ({ onSend, onGenerateImage, isLoading, isGeneratingImage }: ChatInputProps) => {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const rafRef = useRef(0);
    const isImageButtonDisabled = isLoading || isGeneratingImage;

    const handleSend = useCallback(() => {
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      void onSend(trimmed);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [input, isLoading, onSend]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      // Slack式: Ctrl+Enter(またはCmd+Enter)で送信、Enterは改行
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      });
    };

    return (
      <div className="bg-card/60 glass-effect p-3 pb-4">
        <div className="input-glow mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border/40 bg-background/80 p-2 transition-shadow">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            rows={1}
            disabled={isLoading}
          />
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  onClick={() => void onGenerateImage()}
                  variant="outline"
                  size="icon"
                  disabled={isImageButtonDisabled}
                  aria-label={isGeneratingImage ? "画像生成中" : "画像生成"}
                  className={cn(
                    isGeneratingImage &&
                      "border-primary/50 bg-primary/10 text-primary opacity-100 ring-2 ring-primary/20",
                    "disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:ring-1 disabled:ring-border",
                  )}
                >
                  {isGeneratingImage ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>画像生成: 数秒〜数十秒、外部APIを使用</TooltipContent>
            </Tooltip>
            <Button
              onClick={handleSend}
              size="icon"
              disabled={isLoading || !input.trim()}
              title="送信"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";
