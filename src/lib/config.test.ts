import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHARACTER_NAME,
  DEFAULT_SYSTEM_PROMPT,
  IMAGE_POLL_INTERVAL_MS,
  IMAGE_POLL_MAX_ATTEMPTS,
  IMAGE_PROMPT_MAX_LENGTH,
} from "./config";

describe("config constants", () => {
  it("DEFAULT_SYSTEM_PROMPT: 日本語の絶対ルールが含まれる", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain("日本語");
    expect(DEFAULT_SYSTEM_PROMPT).toContain("キャラクター");
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("DEFAULT_CHARACTER_NAME: デフォルトはAI", () => {
    expect(DEFAULT_CHARACTER_NAME).toBe("AI");
  });

  it("IMAGE_PROMPT_MAX_LENGTH: 正の数", () => {
    expect(IMAGE_PROMPT_MAX_LENGTH).toBeGreaterThan(0);
  });

  it("IMAGE_POLL_INTERVAL_MS: 正の数", () => {
    expect(IMAGE_POLL_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("IMAGE_POLL_MAX_ATTEMPTS: 正の数", () => {
    expect(IMAGE_POLL_MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});
