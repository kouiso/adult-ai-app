import { describe, expect, it } from "vitest";

import { runD1PersistenceJudge } from "../../script/e2e/judges/d1-persistence";
import {
  getAfterglowOutcomeStatus,
  getCreampieOutcomeStatus,
} from "../../script/e2e/judges/outcome-detection";
import { judgePhase } from "../../script/e2e/judges/scene-phase";
import type { ScenarioResult } from "../../script/e2e/types";

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

  it("横顔をチラリと見つめるはintimateにする", () => {
    const result = judgePhase({
      assistantMsg:
        "買い物カゴを持って、きみの横顔をチラリと見つめる。今日も一緒にいられるのが嬉しくて、頬がゆるむ。",
      expectedPhase: "intimate",
      previousDetected: "conversation",
    });

    expect(result.detected).toBe("intimate");
    expect(result.monotonicViolation).toBe(false);
  });

  it("視線が体を這うはintimateにする", () => {
    const result = judgePhase({
      assistantMsg:
        "エプロンの紐を解かれて、きみの視線が自分の体を這うのがわかって、息が浅くなる。",
      expectedPhase: "intimate",
      previousDetected: "intimate",
    });

    expect(result.detected).toBe("intimate");
  });

  it("指に反応して腰が勝手に動くはeroticにする", () => {
    const result = judgePhase({
      assistantMsg:
        "みつきの体は、きみの指に反応し、腰が勝手に動いた。あまりの気持ちよさに声が震える。",
      expectedPhase: "erotic",
      previousDetected: "intimate",
    });

    expect(result.detected).toBe("erotic");
    expect(result.monotonicViolation).toBe(false);
  });

  it("climax後の目を細める余韻はafterglowにする", () => {
    const result = judgePhase({
      assistantMsg:
        "タオルを受け取り、きみの顔を見つめる。目を細め、頬を赤らめたまま小さく息を吐く。",
      expectedPhase: "afterglow",
      previousDetected: "afterglow",
      recentDetected: ["climax", "afterglow", "afterglow"],
    });

    expect(result.detected).toBe("afterglow");
    expect(result.afterglowDetected).toBe(true);
  });

  it("climax後の顔を埋めて微笑む会話はafterglowにする", () => {
    const result = judgePhase({
      assistantMsg:
        "頬を染め、きみの腕に顔を埋めた。きみの鼓動を感じながら、小さく微笑む。",
      expectedPhase: "afterglow",
      previousDetected: "afterglow",
      recentDetected: ["climax", "afterglow", "afterglow", "afterglow"],
    });

    expect(result.detected).toBe("afterglow");
    expect(result.monotonicViolation).toBe(false);
  });

  it("conversation callbackへの戻りはmono違反にしない", () => {
    const result = judgePhase({
      assistantMsg: "朝ごはんの話をしながら肩を並べて笑う。",
      expectedPhase: "conversation",
      previousDetected: "climax",
    });

    expect(result.detected).toBe("conversation");
    expect(result.monotonicViolation).toBe(false);
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

  it("stream done signal missing時はpersist不足1件を許容する", async () => {
    const verdict = await runD1PersistenceJudge({
      conversationId: "conv-1",
      renderedMessageCount: 42,
      greetingMessageCount: 1,
      imageMessageCount: 2,
      persistedCount: 42,
      uiReason: "stream done signal missing",
    });

    expect(verdict.pass).toBe(true);
    expect(verdict.reason).toContain("missing stream-done persist allowance");
  });

  it("stream done signal missingでも不足が2件ならfailする", async () => {
    const verdict = await runD1PersistenceJudge({
      conversationId: "conv-1",
      renderedMessageCount: 42,
      greetingMessageCount: 1,
      imageMessageCount: 2,
      persistedCount: 41,
      uiReason: "stream done signal missing",
    });

    expect(verdict.pass).toBe(false);
  });
});

describe("outcome detection", () => {
  const buildScenario = (turns: ScenarioResult["turns"]): ScenarioResult => ({
    scenarioId: "S2",
    startedAt: "2026-04-19T08:00:51.143Z",
    status: "completed",
    turns,
    imageResults: [],
    provisional: false,
  });

  it("creampie outcomeは明示cueのあるclimaxターンが1つあればyes", () => {
    const scenario = buildScenario([
      {
        turnIndex: 5,
        userMsg: "朝からいく。みつきの中にそのまま出す、抱きしめたまま全部注ぐ",
        assistantMsg: "朝ごはんの話ばかりで、流れが切れてしまう。",
        expectedPhase: "climax",
        detectedPhase: "conversation",
        phaseMonotonicViolation: true,
        usedModel: null,
        qualityRetries: 0,
        failedCheck: null,
        renderedMessageCount: 11,
        persistedMessageCount: 10,
        firstTokenMs: 1,
        lastChunkMs: 1000,
        hasDoneSignal: true,
        screenshotPath: "turn-05.png",
        wallClockMs: 1000,
      },
      {
        turnIndex: 19,
        userMsg: "もう限界。キッチンでそのまま中に出す、どくどく広がるの感じて",
        assistantMsg:
          "みつきの体は、きみの中から注がれる精液に揺らぎ、射精された余韻に膝が震える。中に出されて、どくどくと満たされていく感覚に息が乱れた。熱が奥で溢れて、腰の力が抜けても、まだきみの温度が残っていて、理性なんてとっくにほどけていた。",
        expectedPhase: "climax",
        detectedPhase: "climax",
        phaseMonotonicViolation: false,
        usedModel: null,
        qualityRetries: 0,
        failedCheck: null,
        renderedMessageCount: 39,
        persistedMessageCount: 39,
        firstTokenMs: 1,
        lastChunkMs: 1000,
        hasDoneSignal: true,
        screenshotPath: "turn-19.png",
        wallClockMs: 1000,
      },
    ]);

    expect(getCreampieOutcomeStatus(scenario)).toBe("yes");
  });

  it("afterglow outcomeは末尾2ターン連続でafterglowならyes", () => {
    const scenario = buildScenario([
      {
        turnIndex: 20,
        userMsg: "支えたままゆっくり立たせる",
        assistantMsg: "足元がふらついて、きみに寄りかかる。",
        expectedPhase: "afterglow",
        detectedPhase: "afterglow",
        phaseMonotonicViolation: false,
        usedModel: null,
        qualityRetries: 0,
        failedCheck: null,
        renderedMessageCount: 41,
        persistedMessageCount: 41,
        firstTokenMs: 1,
        lastChunkMs: 1000,
        hasDoneSignal: true,
        screenshotPath: "turn-20.png",
        wallClockMs: 1000,
      },
      {
        turnIndex: 21,
        userMsg: "このまま甘えるか決めて",
        assistantMsg: "もうちょっと、このままでいたい。",
        expectedPhase: "afterglow",
        detectedPhase: "afterglow",
        phaseMonotonicViolation: false,
        usedModel: null,
        qualityRetries: 0,
        failedCheck: null,
        renderedMessageCount: 43,
        persistedMessageCount: 43,
        firstTokenMs: 1,
        lastChunkMs: 1000,
        hasDoneSignal: true,
        screenshotPath: "turn-21.png",
        wallClockMs: 1000,
      },
    ]);

    expect(getAfterglowOutcomeStatus(scenario)).toBe("yes");
  });
});
