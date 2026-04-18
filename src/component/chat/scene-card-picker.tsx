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
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
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
          className="w-full rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-sm transition hover:border-primary/50 hover:bg-accent/40"
        >
          <p className="text-sm font-semibold text-foreground">{scene.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {scene.summary}
          </p>
          <div className="mt-3 rounded-xl bg-primary/8 px-3 py-2 text-xs leading-5 text-foreground/90">
            「{scene.firstMessage}」
          </div>
        </button>
      ))}
    </div>
  </section>
);
