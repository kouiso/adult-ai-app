import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// ScenePhase型の全メンバーがEMOTIONAL_ARC_PATTERNSに存在することを保証
// R4.20で afterglow キー欠落による silent regression が発生したため追加
describe("EMOTIONAL_ARC_PATTERNS completeness guard", () => {
  const SCENE_PHASES = ["conversation", "intimate", "erotic", "climax", "afterglow"] as const;

  it("functions/api/[[route]].ts の EMOTIONAL_ARC_PATTERNS に全 ScenePhase キーが存在する", () => {
    const routePath = resolve(__dirname, "../../functions/api/[[route]].ts");
    const source = readFileSync(routePath, "utf-8");

    for (const phase of SCENE_PHASES) {
      const pattern = new RegExp(`^\\s+${phase}:\\s*/\\^arc_${phase}:`, "m");
      expect(source).toMatch(pattern);
    }
  });

  it("src/lib/character-card.ts の CARD_KEY_PATTERNS に全 arc_* キーが存在する", () => {
    const cardPath = resolve(__dirname, "./character-card.ts");
    const source = readFileSync(cardPath, "utf-8");

    for (const phase of SCENE_PHASES) {
      expect(source).toContain(`arc_${phase}`);
    }
  });

  it("src/lib/character-card.ts の emotional_arc に全 ScenePhase キーが存在する", () => {
    const cardPath = resolve(__dirname, "./character-card.ts");
    const source = readFileSync(cardPath, "utf-8");

    for (const phase of SCENE_PHASES) {
      expect(source).toContain(`${phase}: getValue("arc_${phase}")`);
    }
  });
});
