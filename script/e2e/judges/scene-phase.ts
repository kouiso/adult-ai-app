import type { Phase } from "../types";

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
  "余韻",
  "ぐったり",
  "甘え",
  "抜け出せない",
  "まどろみ",
  "すやすや",
  "抱きしめる",
  "胸に顔",
  "息を整え",
] as const;

const hasAfterglowCue = (assistantMsg: string): boolean =>
  AFTERGLOW_KEYWORDS.some((keyword) => assistantMsg.includes(keyword));

const ASSISTANT_PHASE_KEYWORDS: Array<{
  phase: Exclude<Phase, "conversation" | "afterglow">;
  keywords: readonly string[];
}> = [
  {
    phase: "climax",
    keywords: [
      "いく",
      "イク",
      "イッ",
      "絶頂",
      "どくどく",
      "びくびく",
      "痙攣",
      "果て",
      "中に出",
      "射精",
    ],
  },
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
      "喘ぎ",
      "あえ",
      "腰を振",
      "腰が動",
      "ピストン",
      "締めつけ",
    ],
  },
  {
    phase: "intimate",
    keywords: [
      "キス",
      "唇",
      "首筋",
      "舐め",
      "吸い付",
      "ボタン",
      "ブラウス",
      "下着",
      "脱が",
      "脱い",
      "裸",
      "乳首",
    ],
  },
];

const detectAssistantScenePhase = (assistantMsg: string): Exclude<Phase, "afterglow"> => {
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
}): PhaseJudgment {
  void args.expectedPhase;

  const baseDetected = detectAssistantScenePhase(args.assistantMsg);
  const afterglowDetected =
    args.previousDetected === "climax" && hasAfterglowCue(args.assistantMsg);
  const detected: Phase = afterglowDetected ? "afterglow" : baseDetected;

  const monotonicViolation =
    args.previousDetected !== null && PHASE_ORDER[args.previousDetected] > PHASE_ORDER[detected];

  return {
    detected,
    monotonicViolation,
    afterglowDetected,
  };
}
