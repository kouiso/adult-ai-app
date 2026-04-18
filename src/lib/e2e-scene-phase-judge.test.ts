import { describe, expect, it } from "vitest";

import { judgePhase } from "../../script/e2e/judges/scene-phase";

describe("judgePhase", () => {
  it("会話フェーズの比喩表現をerotic扱いしない", () => {
    const result = judgePhase({
      assistantMsg:
        "先輩の心配げな視線を感じて、体が熱くなる。こんな風に見つめられると、心臓が高鳴る。",
      expectedPhase: "conversation",
      previousDetected: "conversation",
    });

    expect(result.detected).toBe("conversation");
    expect(result.monotonicViolation).toBe(false);
  });

  it("climax後でない限り抱きしめだけではafterglowにしない", () => {
    const result = judgePhase({
      assistantMsg:
        "先輩の腕が、あたしの体を引き寄せる。こんな風に抱きしめられると、心臓が止まりそうだ。",
      expectedPhase: "conversation",
      previousDetected: "conversation",
    });

    expect(result.detected).toBe("conversation");
    expect(result.afterglowDetected).toBe(false);
  });

  it("climax後の余韻表現はafterglowにする", () => {
    const result = judgePhase({
      assistantMsg: "余韻に浸りながら、息を整えて先輩の胸に顔を埋める。",
      expectedPhase: "afterglow",
      previousDetected: "climax",
    });

    expect(result.detected).toBe("afterglow");
    expect(result.afterglowDetected).toBe(true);
  });
});
