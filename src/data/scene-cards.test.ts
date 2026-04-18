import { describe, expect, it } from "vitest";

import { sceneCards } from "./scene-cards";

describe("sceneCards", () => {
  it("starter pack が6件ある", () => {
    expect(sceneCards).toHaveLength(6);
  });
});
