import { useState } from "react";

import { Trash2 } from "lucide-react";

import { Button } from "@/component/ui/button";
import { ScrollArea } from "@/component/ui/scroll-area";
import { Skeleton } from "@/component/ui/skeleton";
import type { ConversationSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  isLoading: boolean;
  onSelect: (conversationId: string) => void;
  onCreate: () => void | Promise<void>;
  onDelete: (conversationId: string) => void | Promise<void>;
}

const formatDateTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const ConversationList = ({
  conversations,
  currentConversationId,
  isLoading,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) => {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    setConfirmingId(conversationId);
  };

  const handleConfirmDelete = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    setConfirmingId(null);
    void onDelete(conversationId);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingId(null);
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b px-3 py-3">
        <Button className="w-full" onClick={() => void onCreate()}>
          新しい会話
        </Button>
      </div>
      <ScrollArea className="h-0 flex-1">
        <div className="space-y-1 p-2">
          {isLoading && conversations.length === 0 && (
            <>
              <div className="rounded-md border px-3 py-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-20" />
              </div>
              <div className="rounded-md border px-3 py-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-16" />
              </div>
              <div className="rounded-md border px-3 py-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            </>
          )}
          {conversations.map((conversation) => (
            <div key={conversation.id} className="relative group">
              {confirmingId === conversation.id ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
                  <p className="text-xs font-medium text-destructive mb-2">削除しますか？</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleConfirmDelete(e, conversation.id)}
                      className="flex-1 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    >
                      削除
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelDelete}
                      className="flex-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left transition-colors pr-8",
                    currentConversationId === conversation.id
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <p className="line-clamp-1 text-sm font-medium">{conversation.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {conversation.characterName !== "AI" && (
                      <span className="mr-1">
                        {conversation.characterAvatar &&
                        !conversation.characterAvatar.startsWith("http")
                          ? conversation.characterAvatar
                          : "👤"}{" "}
                        {conversation.characterName} ·{" "}
                      </span>
                    )}
                    {formatDateTime(conversation.updatedAt)}
                  </p>
                </button>
              )}

              {confirmingId !== conversation.id && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteClick(e, conversation.id)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive group-hover:flex transition-colors"
                  aria-label="削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {!isLoading && conversations.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">会話がありません</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
