// サーバー側(functions/api/[[route]].ts)と同じフェーズ検出ロジック
// クライアント側の品質ガードでフェーズ情報が必要なため移植

export type ScenePhase = "climax" | "erotic" | "intimate" | "conversation" | "afterglow";

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
  phase: Exclude<ScenePhase, "conversation" | "afterglow">;
  keywords: readonly string[];
}[] = [
  {
    phase: "climax",
    keywords: [
      "いく",
      "いきそう",
      "イク",
      "イキそう",
      "イきそう",
      "イッ",
      "逝きそう",
      "出して",
      "中に出",
      "中にだ",
      "中で出",
      "中出",
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
      "入れていい",
      "入れる",
      "入れて",
      "入れたい",
      "腰を動",
      "喘",
      "あえ",
      "乳首",
      "胸",
      "触れ",
      "舐め",
      "濡れ",
      "気持ちいい",
      "気持いい",
      "気持ちええ",
      "きもちいい",
      "きもちええ",
      "快感",
      "我慢でき",
      "我慢出来",
      "我慢できへん",
      "我慢できない",
      "我慢出来ない",
      "我慢出来へん",
      "もう我慢",
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
      "脱がせ",
      "服脱",
      "全部見せ",
      "ボタン",
      "ブラウス",
      "シャツ",
      "裸",
      "胸",
    ],
  },
];

const QUALITY_RETRY_USER_MESSAGE_PREFIXES = [
  "品質チェックに不合格でした",
  "品質チェックに不合格",
] as const;

function normalizePhaseScanText(content: string): string {
  return content.normalize("NFKC").replace(/\s+/g, "");
}

function isQualityRetryUserMessage(content: string): boolean {
  const normalized = normalizePhaseScanText(content);
  return QUALITY_RETRY_USER_MESSAGE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function matchesPhaseKeywords(content: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => content.includes(normalizePhaseScanText(kw)));
}

export function detectScenePhase(messages: { role: string; content: string }[]): ScenePhase {
  // 実ユーザー発話のみでフェーズを判定する。品質ガードの再生成指示は内部制御なので除外する。
  // assistantの応答を含めるとモデルの暴走が次ターンのフェーズを不当に昇格させる。
  const userMessages = messages.filter(
    (m) => m.role === "user" && !isQualityRetryUserMessage(m.content),
  );
  const scanTarget = normalizePhaseScanText(userMessages.at(-1)?.content ?? "");
  const recentUserMessages = userMessages.slice(-(AFTERGLOW_LOOKBACK_TURNS + 1), -1);
  const hadRecentClimax = recentUserMessages.some((message) =>
    matchesPhaseKeywords(
      normalizePhaseScanText(message.content),
      PHASE_DETECTION_ORDER[0].keywords,
    ),
  );
  const hasAfterglowCue = matchesPhaseKeywords(scanTarget, AFTERGLOW_CUES);

  if (hadRecentClimax && hasAfterglowCue) return "afterglow";

  for (const { phase, keywords } of PHASE_DETECTION_ORDER) {
    if (matchesPhaseKeywords(scanTarget, keywords)) return phase;
  }
  return "conversation";
}

export const getMaxTokensForPhase = (phase: ScenePhase): number => {
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
