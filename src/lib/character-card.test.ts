import { describe, expect, it } from "vitest";

import { parseCharacterCard } from "./character-card";

const SAMPLE_CARD = `
【キャラカード】
name: みつき
first_person: あたし
speech_endings: よ、わ、かな
verbal_tics: えっと、あのね
forbidden_words: 俺、僕
arc_conversation: 明るく人懐っこい
arc_intimate: 甘えた声で
arc_erotic: 積極的に
arc_climax: 理性を失う
sensory_focus: 唇、指先
`;

describe("parseCharacterCard", () => {
  it("YAML風カードをパースする", () => {
    const card = parseCharacterCard(SAMPLE_CARD);
    expect(card).not.toBeNull();
    expect(card?.name).toBe("みつき");
    expect(card?.first_person).toBe("あたし");
    expect(card?.speech_endings).toEqual(["よ", "わ", "かな"]);
    expect(card?.verbal_tics).toEqual(["えっと", "あのね"]);
    expect(card?.forbidden_words).toEqual(["俺", "僕"]);
    expect(card?.emotional_arc.conversation).toBe("明るく人懐っこい");
    expect(card?.emotional_arc.climax).toBe("理性を失う");
    expect(card?.sensory_focus).toEqual(["唇", "指先"]);
  });

  it("カードマーカーがなければnull", () => {
    expect(parseCharacterCard("普通のプロンプト")).toBeNull();
  });

  it("nameがなければnull", () => {
    const card = parseCharacterCard("【キャラカード】\nfirst_person: あたし");
    expect(card).toBeNull();
  });
});
