import { describe, expect, it } from "vitest";

import { runD1PersistenceJudge } from "../../script/e2e/judges/d1-persistence";
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

  it("climaxからconversationに戻ってもafterglow cueがあればmono違反にしない", () => {
    const result = judgePhase({
      assistantMsg: "余韻に沈みながら、息を整えて静かに微笑む。",
      expectedPhase: "conversation",
      previousDetected: "climax",
    });

    expect(result.detected).toBe("afterglow");
    expect(result.monotonicViolation).toBe(false);
  });

  it("て-formの『いく』ではclimax誤判定しない", () => {
    const result = judgePhase({
      assistantMsg:
        "けんちゃんの言葉に頬を染めながら、みつきはゆっくり顔を近づけていく。唇が触れそうで、息が止まりそうだった。",
      expectedPhase: "intimate",
      previousDetected: "conversation",
    });

    expect(result.detected).toBe("intimate");
    expect(result.afterglowDetected).toBe(false);
  });

  it("climaxから7ターン以内ならafterglow windowを維持する", () => {
    const result = judgePhase({
      assistantMsg: "けんちゃんの腕に寄りかかって立ち上がると、足元が少しふらついて支えが恋しくなる。",
      expectedPhase: "afterglow",
      previousDetected: "conversation",
      recentDetected: [
        "climax",
        "conversation",
        "conversation",
        "conversation",
        "conversation",
        "conversation",
        "conversation",
      ],
    });

    expect(result.detected).toBe("afterglow");
    expect(result.afterglowDetected).toBe(true);
  });
});

describe("runD1PersistenceJudge", () => {
  it("persisted image rowをrendered平均との差分として許容する", async () => {
    const verdict = await runD1PersistenceJudge({
      conversationId: "conv-1",
      renderedMessageCount: 13,
      greetingMessageCount: 1,
      imageMessageCount: 1,
      persistedCount: 13,
    });

    expect(verdict.pass).toBe(true);
    expect(verdict.reason).toContain("imageMessageCount 1");
  });
});
