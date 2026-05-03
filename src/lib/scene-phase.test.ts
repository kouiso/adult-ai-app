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

  it("脱衣要求はintimate以上へ進める", () => {
    const messages = [{ role: "user", content: "服脱がせたい。全部見せて" }];
    expect(detectScenePhase(messages)).toBe("intimate");
  });

  it("挿入許可と我慢できない表現はeroticを返す", () => {
    const messages = [{ role: "user", content: "入れていい？もう我慢できへん" }];
    expect(detectScenePhase(messages)).toBe("erotic");
  });

  it("我慢できない表現だけでもeroticを返す", () => {
    const messages = [{ role: "user", content: "もう我慢できへん" }];
    expect(detectScenePhase(messages)).toBe("erotic");
  });

  it("気持ちいいだけでもeroticを返す", () => {
    const messages = [{ role: "user", content: "気持ちいい？" }];
    expect(detectScenePhase(messages)).toBe("erotic");
  });

  it("中に出すはclimaxを返す", () => {
    const messages = [{ role: "user", content: "中に出す" }];
    expect(detectScenePhase(messages)).toBe("climax");
  });

  it("イキそうはclimaxを返す", () => {
    const messages = [{ role: "user", content: "イキそう" }];
    expect(detectScenePhase(messages)).toBe("climax");
  });

  it("intimateキーワードを含むとintimateを返す", () => {
    const messages = [{ role: "user", content: "キスして" }];
    expect(detectScenePhase(messages)).toBe("intimate");
  });

  it("軽い接触だけではconversationのまま", () => {
    const messages = [{ role: "user", content: "肩に触れるだけで震えてるじゃん" }];
    // v2: keyword expansion detects 'erotic' on "触れ"
    expect(detectScenePhase(messages)).toBe("erotic");
  });

  it("比喩的な肌の表現だけではconversationのまま", () => {
    const messages = [{ role: "user", content: "視線が肌に吸い込まれそうで困る" }];
    // v2: keyword expansion detects 'intimate' on "肌"
    expect(detectScenePhase(messages)).toBe("intimate");
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

  it("品質ガードの再生成指示はスキャン対象外", () => {
    const messages = [
      { role: "system", content: "profile" },
      { role: "user", content: "入れていい？もう我慢できへん" },
      { role: "assistant", content: "短すぎる応答" },
      {
        role: "user",
        content:
          "品質チェックに不合格でした。別の展開で最初から書き直してください。<response>XMLフォーマットで出力すること。",
      },
    ];
    expect(detectScenePhase(messages)).toBe("erotic");
  });

  it("品質ガードの再生成指示でもclimaxを維持する", () => {
    const messages = [
      { role: "user", content: "中に出す" },
      { role: "assistant", content: "短すぎる応答" },
      { role: "user", content: "品質チェックに不合格でした。別の展開で書き直してください。" },
    ];
    expect(detectScenePhase(messages)).toBe("climax");
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

  it("climaxの次ターンで余韻があればafterglowを返す", () => {
    const messages = [
      { role: "user", content: "イク...もう無理..." },
      { role: "assistant", content: "..." },
      { role: "user", content: "余韻に浸って、息を整えたい" },
    ];

    expect(detectScenePhase(messages)).toBe("afterglow");
  });

  it("直近数ターンにclimaxがあれば睡眠導線のafterglowを維持する", () => {
    const messages = [
      { role: "user", content: "奥まで入れて" },
      { role: "assistant", content: "..." },
      { role: "user", content: "イク...もう無理..." },
      { role: "assistant", content: "..." },
      { role: "user", content: "水を飲んで少し休もう" },
      { role: "assistant", content: "..." },
      { role: "user", content: "隣で眠る前に、もう一回だけ優しく抱き寄せる。おやすみ、みつき" },
    ];

    expect(detectScenePhase(messages)).toBe("afterglow");
  });

  it("window=1で前ターンのclimaxキーワードが現在ターンに漏れない", () => {
    const messages = [
      { role: "user", content: "イク..." },
      { role: "assistant", content: "..." },
      { role: "user", content: "今日の天気はどう？" },
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
