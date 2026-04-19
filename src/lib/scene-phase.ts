// サーバー側(functions/api/[[route]].ts)と同じフェーズ検出ロジック
// クライアント側の品質ガードでフェーズ情報が必要なため移植

export type ScenePhase = "climax" | "erotic" | "intimate" | "conversation";
export type MaxTokenPhase = ScenePhase | "afterglow";

export const AFTERGLOW_CUES = [
  "達し",
  "イッた",
  "イッて",
  "余韻",
  "収ま",
  "息を整え",
  "ぐったり",
  "終わっ",
  "果て",
  "脱力",
  "おやすみ",
  "寝息",
  "眠る",
  "眠り",
] as const;

const AFTERGLOW_LOOKBACK_TURNS = 6;

const PHASE_DETECTION_ORDER: {
  phase: Exclude<ScenePhase, "conversation">;
  keywords: readonly string[];
}[] = [
  {
    phase: "climax",
    keywords: [
      "いく",
      "イク",
      "イッ",
      "出して",
      "中に出",
      "射精",
      "どくどく",
      "びくびく",
      "痙攣",
      "絶頂",
      "アクメ",
      "果て",
    ],
  },
  {
    phase: "erotic",
    keywords: [
      "挿入",
      "奥まで",
      "腰を振",
      "突き",
      "濡れ",
      "感じて",
      "咥え",
      "しゃぶ",
      "腰が動",
      "締めつけ",
      "ピストン",
      "中に入",
      "入れる",
      "入れて",
      "腰を動",
      "喘",
      "あえ",
      "乳首",
      "胸",
      "触れ",
      "舐め",
      "濡れ",
      "昂",
      "熱く",
      "硬く",
      "欲しい",
    ],
  },
  {
    phase: "intimate",
    keywords: [
      "キス",
      "唇",
      "抱きしめ",
      "密着",
      "肌",
      "体温",
      "耳元",
      "首筋",
      "愛撫",
      "舐め",
      "揉",
      "乳首",
      "下着",
      "脱が",
      "脱い",
      "ボタン",
      "ブラウス",
      "シャツ",
      "裸",
      "胸",
    ],
  },
];

export function detectScenePhase(messages: { role: string; content: string }[]): ScenePhase {
  // ユーザーメッセージのみでフェーズを判定
  // assistantの応答を含めるとモデルの暴走が次ターンのフェーズを不当に昇格させる
  const userMessages = messages.filter((m) => m.role === "user");
  const scanTarget = userMessages.at(-1)?.content ?? "";
  const recentUserMessages = userMessages.slice(-(AFTERGLOW_LOOKBACK_TURNS + 1), -1);
  const hadRecentClimax = recentUserMessages.some((message) =>
    PHASE_DETECTION_ORDER[0].keywords.some((kw) => message.content.includes(kw)),
  );
  const hasAfterglowCue = AFTERGLOW_CUES.some((cue) => scanTarget.includes(cue));

  if (hadRecentClimax && hasAfterglowCue) return "afterglow" as ScenePhase;

  for (const { phase, keywords } of PHASE_DETECTION_ORDER) {
    if (keywords.some((kw) => scanTarget.includes(kw))) return phase;
  }
  return "conversation";
}

export const getMaxTokensForPhase = (phase: MaxTokenPhase): number => {
  switch (phase) {
    case "conversation":
      return 1024;
    case "intimate":
      return 1536;
    case "erotic":
      return 2048;
    case "climax":
      return 2560;
    case "afterglow":
      return 1024;
  }
};
