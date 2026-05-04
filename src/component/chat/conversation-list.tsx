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
import type { SceneCard } from "@/data/scene-cards";
import type { ConversationSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ContinueConversationCard } from "./continue-conversation-card";
import { SceneCardPicker } from "./scene-card-picker";

type ContinueConversationCardData = {
  conversationId: string;
  characterName: string;
  characterAvatar: string | null;
  updatedAt: number;
  messages: {
    id: string;
    role: "system" | "user" | "assistant";
    content: string;
    createdAt: number;
  }[];
};

interface ConversationListProps {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  isLoading: boolean;
  continueConversationCard: ContinueConversationCardData | null;
  sceneCards: readonly SceneCard[];
  onSelect: (conversationId: string) => void;
  onCreate: () => void | Promise<void>;
  onStartScene: (scene: SceneCard) => void | Promise<void>;
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
    continueConversationCard,
    sceneCards,
    onSelect,
    onCreate,
    onStartScene,
    onDelete,
    onDeleteAll,
  }: ConversationListProps) => (
    <div className="flex h-full w-full flex-col">
      <div className="border-b px-3 py-3 space-y-2">
        <Button
          className="w-full bg-gradient-to-r from-primary to-[oklch(0.42_0.14_10)] text-primary-foreground shadow-[0_8px_24px_oklch(0.50_0.18_350_/_18%)] transition hover:from-primary/90 hover:to-[oklch(0.42_0.14_10_/_90%)]"
          onClick={() => void onCreate()}
        >
          新しい会話
        </Button>
      </div>
      <ScrollArea className="h-0 flex-1">
        <div className="space-y-1 p-2">
          {continueConversationCard ? (
            <div className="mb-3">
              <ContinueConversationCard
                conversationId={continueConversationCard.conversationId}
                characterName={continueConversationCard.characterName}
                characterAvatar={continueConversationCard.characterAvatar}
                updatedAt={continueConversationCard.updatedAt}
                messages={continueConversationCard.messages}
                onContinue={onSelect}
              />
            </div>
          ) : null}

          <div className="mb-3 rounded-2xl border border-border/60 bg-card/50 p-3">
            <SceneCardPicker sceneCards={sceneCards} onSelect={onStartScene} layout="list" />
          </div>

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
                data-conversation-id={conversation.id}
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition pr-8",
                  currentConversationId === conversation.id
                    ? "border-l-primary border-l-2 border-y-border/70 border-r-border/70 bg-card/85 shadow-[inset_6px_0_14px_-12px_oklch(0.70_0.16_350),0_0_22px_oklch(0.50_0.18_350_/_10%)]"
                    : "border-transparent hover:bg-accent/60 hover:shadow-[0_8px_24px_oklch(0.50_0.18_350_/_8%)]",
                )}
              >
                <p className="line-clamp-1 text-sm font-medium">{conversation.title}</p>
                <p className="mt-1 flex items-center text-xs text-muted-foreground">
                  {conversation.characterName !== "AI" && (
                    <span className="mr-1 inline-flex items-center gap-1">
                      {conversation.characterAvatar &&
                      (conversation.characterAvatar.startsWith("http") ||
                        conversation.characterAvatar.startsWith("/")) ? (
                        <img
                          src={conversation.characterAvatar}
                          alt={conversation.characterName ?? ""}
                          className="inline-block h-6 w-6 rounded-full border border-primary/20 object-cover shadow-sm"
                        />
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[11px] text-primary">
                          {conversation.characterName.slice(0, 1)}
                        </span>
                      )}{" "}
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
          {conversations.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button
                    type="button"
                    className="mx-auto mt-3 flex rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
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
          {!isLoading && conversations.length === 0 && (
            <div className="rounded-2xl border border-border/70 bg-card/65 px-4 py-8 text-center shadow-sm">
              <p className="font-narrative text-sm font-semibold text-foreground">
                まだ会話がありません
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                シーンを選ぶか、新しい会話から始められます。
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  ),
);

ConversationList.displayName = "ConversationList";
