import { memo } from "react";

import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/component/ui/alert-dialog";
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
  onDeleteAll: () => void | Promise<void>;
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

export const ConversationList = memo(
  ({
    conversations,
    currentConversationId,
    isLoading,
    onSelect,
    onCreate,
    onDelete,
    onDeleteAll,
  }: ConversationListProps) => (
    <div className="flex h-full w-full flex-col">
      <div className="border-b px-3 py-3 space-y-2">
        <Button className="w-full" onClick={() => void onCreate()}>
          新しい会話
        </Button>
        {conversations.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground"
                />
              }
            >
              全会話を削除
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>全会話を削除</AlertDialogTitle>
                <AlertDialogDescription>
                  全{conversations.length}件の会話を削除しますか？この操作は取り消せません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void onDeleteAll()}>
                  全削除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
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
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-colors pr-8",
                  currentConversationId === conversation.id
                    ? "border-primary/50 bg-primary/10 shadow-sm"
                    : "border-transparent hover:bg-accent/60",
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

              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive group-hover:flex transition-colors"
                      aria-label="削除"
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>会話を削除</AlertDialogTitle>
                    <AlertDialogDescription>
                      この会話を削除しますか？この操作は取り消せません。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => void onDelete(conversation.id)}
                    >
                      削除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          {!isLoading && conversations.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">会話がありません</p>
          )}
        </div>
      </ScrollArea>
    </div>
  ),
);

ConversationList.displayName = "ConversationList";
