import { Button } from "@/component/ui/button";
import { ScrollArea } from "@/component/ui/scroll-area";
import type { ConversationSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onCreate: () => void | Promise<void>;
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
  onSelect,
  onCreate,
}: ConversationListProps) => (
  <aside className="hidden w-72 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
    <div className="border-b px-3 py-3">
      <Button className="w-full" onClick={() => void onCreate()}>
        新しい会話
      </Button>
    </div>
    <ScrollArea className="h-0 flex-1">
      <div className="space-y-1 p-2">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left transition-colors",
              currentConversationId === conversation.id
                ? "border-primary bg-primary/10"
                : "border-transparent hover:bg-muted",
            )}
          >
            <p className="line-clamp-1 text-sm font-medium">{conversation.title}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{conversation.characterName}</span>
              <span>·</span>
              <span>{formatDateTime(conversation.updatedAt)}</span>
            </div>
          </button>
        ))}
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">会話がありません</p>
        )}
      </div>
    </ScrollArea>
  </aside>
);
