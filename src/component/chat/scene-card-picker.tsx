import { Sparkles } from "lucide-react";

import type { SceneCard } from "@/data/scene-cards";
import { cn } from "@/lib/utils";

type SceneCardPickerProps = {
  sceneCards: readonly SceneCard[];
  onSelect: (scene: SceneCard) => void;
  className?: string;
  layout?: "grid" | "list";
};

export const SceneCardPicker = ({
  sceneCards,
  onSelect,
  className,
  layout = "grid",
}: SceneCardPickerProps) => (
  <section className={cn("space-y-3", className)}>
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-warm-gold/15 text-primary shadow-[0_0_18px_oklch(0.50_0.18_350_/_12%)]">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div>
        <p className="text-sm font-semibold">Scene Starter Pack</p>
        <p className="text-xs text-muted-foreground">気分から会話を始める</p>
      </div>
    </div>
    <div
      className={cn(
        layout === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "space-y-2",
        className,
      )}
    >
      {sceneCards.map((scene) => (
        <button
          key={scene.id}
          type="button"
          onClick={() => onSelect(scene)}
          className="w-full rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-sm transition hover:border-primary/45 hover:bg-gradient-to-br hover:from-primary/10 hover:via-card hover:to-warm-gold/10 hover:shadow-[0_10px_30px_oklch(0.50_0.18_350_/_10%)]"
        >
          <p className="font-narrative text-sm font-semibold text-foreground">{scene.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {scene.summary}
          </p>
          <div className="mt-3 border-l-2 border-primary/35 bg-primary/6 px-3 py-2 font-narrative text-sm italic leading-6 text-foreground/90">
            「{scene.firstMessage}」
          </div>
        </button>
      ))}
    </div>
  </section>
);
