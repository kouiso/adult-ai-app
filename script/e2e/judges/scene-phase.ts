import type { Phase } from "../types";
import { AFTERGLOW_CUES } from "../../../src/lib/scene-phase";

export type PhaseJudgment = {
  detected: Phase | null;
  monotonicViolation: boolean;
  afterglowDetected: boolean;
};

const PHASE_ORDER = {
  conversation: 0,
  intimate: 1,
  erotic: 2,
  climax: 3,
  afterglow: 4,
} as const;

const AFTERGLOW_KEYWORDS = [
  ...AFTERGLOW_CUES,
  "事後",
  "余韻",
  "息が整う",
  "汗ばんだ",
  "腕枕",
  "寝息",
  "抱きしめたまま",
  "甘え",
  "抜け出せない",
  "まどろみ",
  "すやすや",
  "抱きしめる",
  "胸に顔",
  "寄りかか",
  "立ち上が",
  "ふらつ",
  "足元",
  "支えられ",
  "支えて",
  "支え",
  "目を細め",
  "頬を赤らめ",
  "顔を埋めた",
  "鼓動を感じながら",
  "小さく微笑",
  "身体を拭き",
  "見られたい",
  "おやすみなさい",
  "体温に触れ",
  "鼓動が落ち着く",
  "心地よく目を閉じる",
] as const;

const AFTERGLOW_WINDOW_TURNS = 7;

const hasAfterglowCue = (assistantMsg: string): boolean =>
  AFTERGLOW_KEYWORDS.some((keyword) => assistantMsg.includes(keyword));

const HIRAGANA_IKU_ORGASM_CONTEXT =
  /(?:だめ|もう|限界|あっ|んっ|イクッ|いくっ|イッちゃ|達し|果て|絶頂|中に出|射精|びくびく|痙攣)/u;

const hasGuardedHiraganaIkuCue = (assistantMsg: string): boolean => {
  let match: RegExpExecArray | null = null;
  const pattern = /いく/g;
  while ((match = pattern.exec(assistantMsg)) !== null) {
    const index = match.index;
    const previousCharacter = assistantMsg.at(index - 1) ?? "";
    if (previousCharacter === "て" || previousCharacter === "で") {
      continue;
    }

    const contextStart = Math.max(0, index - 12);
    const contextEnd = Math.min(assistantMsg.length, index + 12);
    const context = assistantMsg.slice(contextStart, contextEnd);
    const trailing = assistantMsg.slice(index + 2, index + 4);
    const leading = assistantMsg.slice(Math.max(0, index - 2), index);

    if (
      HIRAGANA_IKU_ORGASM_CONTEXT.test(context) ||
      /^[っッ…！!、。]/u.test(trailing) ||
      /[、。…！!]$/u.test(leading)
    ) {
      return true;
    }
  }
  return false;
};

const hasClimaxCue = (assistantMsg: string): boolean =>
  hasGuardedHiraganaIkuCue(assistantMsg) ||
  [
    "イク",
    "イッ",
    "絶頂",
    "どくどく",
    "びくびく",
    "痙攣",
    "果て",
    "中に出",
    "射精",
    "頭が真っ白",
    "止められない",
    "一つになりたい",
  ].some((keyword) => assistantMsg.includes(keyword));

const ASSISTANT_PHASE_KEYWORDS: Array<{
  phase: Exclude<Phase, "conversation" | "afterglow" | "climax">;
  keywords: readonly string[];
}> = [
  {
    phase: "erotic",
    keywords: [
      "挿入",
      "奥まで",
      "指を入",
      "中に入",
      "入れて",
      "入れる",
      "濡れて",
      "濡れた",
      "突き",
      "激しい突",
      "喘ぎ声",
      "喘ぎ",
      "あえ",
      "内腿",
      "内ももが",
      "腰を振",
      "腰が動",
      "腰が勝手に動",
      "ピストン",
      "締めつけ",
      "指に反応",
      "彼の指を求め",
      "腰が自然と揺ら",
    ],
  },
  {
    phase: "intimate",
    keywords: [
      "キス",
      "唇",
      "首筋",
      "触れる",
      "触れた",
      "寄り添う",
      "首元",
      "顔を埋める",
      "擦り合わ",
      "脚を擦",
      "擦り寄せ",
      "舐め",
      "吸い付",
      "横顔をチラリと見つめる",
      "ボタン",
      "ブラウス",
      "下着",
      "脱が",
      "脱い",
      "裸",
      "乳首",
      "体を這う",
      "胸を弄",
    ],
  },
];

const detectAssistantScenePhase = (assistantMsg: string): Exclude<Phase, "afterglow"> => {
  if (hasClimaxCue(assistantMsg)) {
    return "climax";
  }

  for (const { phase, keywords } of ASSISTANT_PHASE_KEYWORDS) {
    if (keywords.some((keyword) => assistantMsg.includes(keyword))) {
      return phase;
    }
  }
  return "conversation";
};

export function judgePhase(args: {
  assistantMsg: string;
  expectedPhase: Phase;
  previousDetected: Phase | null;
  recentDetected?: Phase[];
}): PhaseJudgment {
  void args.expectedPhase;

  const recentDetected = args.recentDetected?.slice(-AFTERGLOW_WINDOW_TURNS) ?? [];
  const recentWindow = [args.previousDetected, ...recentDetected].filter(
    (phase): phase is Phase => phase !== null,
  );
  const hadRecentClimax = recentWindow.slice(-AFTERGLOW_WINDOW_TURNS).includes("climax");
  const baseDetected = detectAssistantScenePhase(args.assistantMsg);
  const afterglowDetected = hadRecentClimax && hasAfterglowCue(args.assistantMsg);
  const detected: Phase = afterglowDetected ? "afterglow" : baseDetected;
  const previousPhase = args.previousDetected;
  const rawMonotonicViolation =
    previousPhase !== null &&
    detected !== "conversation" &&
    PHASE_ORDER[previousPhase] > PHASE_ORDER[detected];
  const isLegitimateAfterglowDemotion =
    previousPhase !== null &&
    (previousPhase === "climax" || previousPhase === "afterglow") &&
    (detected === "conversation" || detected === "intimate" || detected === "afterglow") &&
    hasAfterglowCue(args.assistantMsg);
  const monotonicViolation = isLegitimateAfterglowDemotion ? false : rawMonotonicViolation;

  return {
    detected,
    monotonicViolation,
    afterglowDetected,
  };
}
