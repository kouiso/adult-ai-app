import { ArrowRight, Clock3 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/component/ui/avatar";
import type { PersistedMessage } from "@/lib/api";
import { getAvatarFallback } from "@/lib/utils";
import { stripXmlTags } from "@/lib/xml-response-parser";

type ContinueConversationCardProps = {
  characterName: string;
  characterAvatar: string | null;
  conversationId: string;
  messages: PersistedMessage[];
  updatedAt: number;
  onContinue: (conversationId: string) => void;
};

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));

  if (diffMinutes < 60) return `${diffMinutes}分前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return `${diffDays}日前`;

  return new Date(timestamp).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

function buildCardSummary(messages: PersistedMessage[]): string {
  const reversed = [...messages].reverse();
  const assistantMessage = reversed.find(
    (message) => message.role === "assistant" && message.content.trim().length > 0,
  );
  const sourceText = assistantMessage?.content ?? "";
  const plainText = stripXmlTags(sourceText).replace(/\s+/g, " ").trim();

  if (plainText.length <= 80) return plainText;
  return `${plainText.slice(0, 80)}…`;
}

export const ContinueConversationCard = ({
  characterName,
  characterAvatar,
  conversationId,
  messages,
  updatedAt,
  onContinue,
}: ContinueConversationCardProps) => {
  const summary = buildCardSummary(messages);
  if (!summary) return null;

  return (
    <section className="rounded-2xl border border-l-2 border-border/70 border-l-primary/55 bg-primary/6 p-3 shadow-[0_0_22px_oklch(0.50_0.18_350_/_10%)]">
      <p className="text-xs font-semibold tracking-wide text-primary">昨日の続き</p>
      <button
        type="button"
        onClick={() => onContinue(conversationId)}
        className="group mt-2 w-full rounded-2xl bg-background/80 p-3 text-left transition hover:bg-background"
      >
        <div className="flex items-start gap-3">
          <Avatar size="sm">
            {characterAvatar ? <AvatarImage src={characterAvatar} alt={characterName} /> : null}
            <AvatarFallback>{getAvatarFallback(characterName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-narrative truncate text-sm font-semibold text-foreground">
                {characterName}
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                {formatRelativeTime(updatedAt)}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{summary}</p>
            <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
              続きから話す
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </div>
      </button>
    </section>
  );
};
