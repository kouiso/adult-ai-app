import { describe, expect, it } from "vitest";

import {
  buildDriftCorrectionReminder,
  buildMessagesForApi,
  buildPersonaReminder,
  buildRetryMessages,
  extractFirstPerson,
  injectDriftCorrection,
} from "./chat-message-adapter";

describe("extractFirstPerson", () => {
  it("一人称パターンを抽出する", () => {
    expect(extractFirstPerson("一人称は「あたし」を使う")).toBe("あたし");
  });

  it("パターンなしはnull", () => {
    expect(extractFirstPerson("普通のプロンプト")).toBeNull();
  });
});

describe("buildPersonaReminder", () => {
  it("一人称ありのリマインダー", () => {
    const reminder = buildPersonaReminder("みつき", "あたし");
    expect(reminder).toContain("みつき");
    expect(reminder).toContain("あたし");
    expect(reminder).toContain("NEVER use");
  });

  it("一人称なしのリマインダー", () => {
    const reminder = buildPersonaReminder("テスト", null);
    expect(reminder).toContain("テスト");
    expect(reminder).not.toContain("first-person pronoun");
  });
});

describe("buildMessagesForApi", () => {
  it("systemPromptを先頭に配置する", () => {
    const msgs = [{ role: "user" as const, content: "こんにちは", isStreaming: false }];
    const result = buildMessagesForApi(msgs, "テストプロンプト", "AI");
    expect(result[0]).toEqual({ role: "system", content: "テストプロンプト" });
  });

  it("ストリーミング中メッセージを除外する", () => {
    const msgs = [
      { role: "user" as const, content: "こんにちは", isStreaming: false },
      { role: "assistant" as const, content: "途中...", isStreaming: true },
    ];
    const result = buildMessagesForApi(msgs, "prompt", "AI");
    const nonSystemMsgs = result.filter((m) => m.role !== "system");
    expect(nonSystemMsgs).toHaveLength(1);
    expect(nonSystemMsgs[0].content).toBe("こんにちは");
  });

  it("3ターンごとにリマインダーを挿入する", () => {
    const msgs = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg-${i}`,
      isStreaming: false,
    }));
    const result = buildMessagesForApi(msgs, "prompt", "AI");
    const systemMsgs = result.filter((m) => m.role === "system");
    expect(systemMsgs.length).toBeGreaterThanOrEqual(2);
  });

  it("言語リマインダーを最後のuserメッセージ直前に挿入する", () => {
    const msgs = [{ role: "user" as const, content: "テスト", isStreaming: false }];
    const result = buildMessagesForApi(msgs, "prompt", "AI");
    const lastUserIdx = result.findLastIndex((m) => m.role === "user");
    expect(result[lastUserIdx - 1].role).toBe("system");
    expect(result[lastUserIdx - 1].content).toContain("日本語");
  });
});

describe("buildRetryMessages", () => {
  it("品質チェック失敗のリトライメッセージを構築する", () => {
    const original = [{ role: "system" as const, content: "prompt" }];
    const result = buildRetryMessages(original, "bad response", { firstPerson: "あたし" });
    expect(result).toHaveLength(3);
    expect(result[1].role).toBe("assistant");
    expect(result[2].role).toBe("user");
    expect(result[2].content).toContain("品質チェック");
    expect(result[2].content).toContain("あたし");
  });

  it("一人称未指定でも動作する", () => {
    const result = buildRetryMessages([{ role: "system" as const, content: "p" }], "resp", {});
    expect(result).toHaveLength(3);
  });

  it("cross-turn-repetition用の具体的な書き直し指示を含める", () => {
    const result = buildRetryMessages(
      [{ role: "system" as const, content: "p" }],
      "resp",
      {},
      "cross-turn-repetition",
    );
    expect(result[2].content).toContain("前回と同じ文");
    expect(result[2].content).toContain("完全に異なる表現");
  });
});

describe("buildDriftCorrectionReminder", () => {
  it("ドリフト補正リマインダーを生成する", () => {
    const msg = buildDriftCorrectionReminder("みつき", "あたし", ["俺", "僕", "私"]);
    expect(msg.role).toBe("system");
    expect(msg.content).toContain("CRITICAL DRIFT CORRECTION");
    expect(msg.content).toContain("みつき");
    expect(msg.content).toContain("あたし");
    expect(msg.content).toContain("「俺」");
    expect(msg.content).toContain("「僕」");
    expect(msg.content).toContain("「私」");
  });
});

describe("injectDriftCorrection", () => {
  it("最後のuserメッセージ直前にドリフト補正を注入する", () => {
    const messages = [
      { role: "system" as const, content: "prompt" },
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi" },
      { role: "user" as const, content: "next" },
    ];
    const result = injectDriftCorrection(messages, "みつき", "あたし", ["俺", "僕"]);
    const lastUserIdx = result.findLastIndex((m) => m.role === "user");
    expect(result[lastUserIdx - 1].content).toContain("CRITICAL DRIFT CORRECTION");
    expect(result).toHaveLength(5);
  });

  it("userメッセージがない場合はそのまま返す", () => {
    const messages = [{ role: "system" as const, content: "prompt" }];
    const result = injectDriftCorrection(messages, "みつき", "あたし", ["俺"]);
    expect(result).toHaveLength(1);
  });
});
