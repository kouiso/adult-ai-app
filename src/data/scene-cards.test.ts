import { describe, expect, it } from "vitest";

import { sceneCards } from "./scene-cards";

describe("sceneCards", () => {
  it("starter pack が9件ある", () => {
    expect(sceneCards).toHaveLength(9);
  });

  it("全シーンにキャラクター情報がある", () => {
    for (const scene of sceneCards) {
      expect(scene.character.name.length).toBeGreaterThan(0);
      expect(scene.character.personality.length).toBeGreaterThan(0);
      expect(scene.character.appearance.length).toBeGreaterThan(0);
      expect(scene.character.relationship.length).toBeGreaterThan(0);
      expect(scene.character.speakingStyle.length).toBeGreaterThan(0);
    }
  });
});
