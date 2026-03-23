import { useCallback, useRef, useState } from "react";

import { Button } from "@/component/ui/button";
import { Textarea } from "@/component/ui/textarea";

interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>;
  onGenerateImage: () => void | Promise<void>;
  isLoading: boolean;
}

export const ChatInput = ({ onSend, onGenerateImage, isLoading }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力..."
          className="min-h-[44px] max-h-[200px] resize-none"
          rows={1}
          disabled={isLoading}
        />
        <div className="flex gap-1">
          <Button
            onClick={() => void onGenerateImage()}
            variant="outline"
            size="icon"
            disabled={isLoading}
            title="画像生成"
          >
            🖼️
          </Button>
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            送信
          </Button>
        </div>
      </div>
    </div>
  );
};
