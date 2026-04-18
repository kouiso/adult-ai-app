import { describe, expect, it } from "vitest";

import { detectScenePhase, getMaxTokensForPhase } from "./scene-phase";

describe("detectScenePhase", () => {
  it("climaxキーワードを含むとclimaxを返す", () => {
    const messages = [{ role: "user", content: "イク…もう限界…" }];
    expect(detectScenePhase(messages)).toBe("climax");
  });

  it("eroticキーワードを含むとeroticを返す", () => {
    const messages = [{ role: "user", content: "奥まで入れて" }];
    expect(detectScenePhase(messages)).toBe("erotic");
  });

  it("intimateキーワードを含むとintimateを返す", () => {
    const messages = [{ role: "user", content: "キスして" }];
    expect(detectScenePhase(messages)).toBe("intimate");
  });

  it("軽い接触だけではconversationのまま", () => {
    const messages = [{ role: "user", content: "肩に触れるだけで震えてるじゃん" }];
    expect(detectScenePhase(messages)).toBe("conversation");
  });

  it("比喩的な肌の表現だけではconversationのまま", () => {
    const messages = [{ role: "user", content: "視線が肌に吸い込まれそうで困る" }];
    expect(detectScenePhase(messages)).toBe("conversation");
  });

  it("キーワードなしはconversationを返す", () => {
    const messages = [{ role: "user", content: "今日の天気はどう？" }];
    expect(detectScenePhase(messages)).toBe("conversation");
  });

  it("assistantメッセージはスキャン対象外", () => {
    const messages = [
      { role: "assistant", content: "イク…" },
      { role: "user", content: "ありがとう" },
    ];
    expect(detectScenePhase(messages)).toBe("conversation");
  });

  it("直近3件のuserメッセージのみをスキャンする", () => {
    const messages = [
      { role: "user", content: "イク" },
      { role: "assistant", content: "..." },
      { role: "user", content: "ありがとう" },
      { role: "assistant", content: "..." },
      { role: "user", content: "楽しかった" },
      { role: "assistant", content: "..." },
      { role: "user", content: "また明日ね" },
    ];
    expect(detectScenePhase(messages)).toBe("conversation");
  });

  it("climaxはeroticより優先される", () => {
    const messages = [{ role: "user", content: "奥まで入れて…イク！" }];
    expect(detectScenePhase(messages)).toBe("climax");
  });

  it("空メッセージ配列はconversation", () => {
    expect(detectScenePhase([])).toBe("conversation");
  });
});

describe("getMaxTokensForPhase", () => {
  it("conversation は 1024", () => {
    expect(getMaxTokensForPhase("conversation")).toBe(1024);
  });

  it("intimate は 1536", () => {
    expect(getMaxTokensForPhase("intimate")).toBe(1536);
  });

  it("erotic は 2048", () => {
    expect(getMaxTokensForPhase("erotic")).toBe(2048);
  });

  it("climax は 2560", () => {
    expect(getMaxTokensForPhase("climax")).toBe(2560);
  });

  it("afterglow は 1024", () => {
    expect(getMaxTokensForPhase("afterglow")).toBe(1024);
  });
});
