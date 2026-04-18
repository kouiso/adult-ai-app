export type CompressedMessage = {
  role: "user" | "assistant";
  content: string;
  turnIndex: number;
};

const RECENT_TURN_COUNT = 10;
const RECENT_MESSAGE_COUNT = RECENT_TURN_COUNT * 2;

const LOCATION_KEYWORDS = [
  "ホテル",
  "部屋",
  "ベッド",
  "ソファ",
  "車",
  "玄関",
  "リビング",
  "キッチン",
  "風呂",
  "シャワー",
  "トイレ",
  "学校",
  "教室",
  "保健室",
  "公園",
  "路地",
] as const;

const RELATION_KEYWORDS = [
  "先輩",
  "後輩",
  "彼女",
  "彼氏",
  "先生",
  "同級生",
  "幼なじみ",
  "妹",
  "姉",
  "妻",
  "夫",
] as const;

const CHARACTER_NAME_PATTERNS = [
  /[一-龠々]{2,4}(?:ちゃん|さん|くん|先輩|先生)/gu,
  /[ァ-ヶー]{2,8}(?:ちゃん|さん|くん)/gu,
] as const;

const AFTERGLOW_KEYWORDS = [
  "余韻",
  "抱き合",
  "寄り添",
  "腕の中",
  "ぬくもり",
  "落ち着",
  "キスしながら",
  "まどろ",
] as const;

const CLIMAX_KEYWORDS = ["イく", "いく", "イッ", "絶頂", "中出し", "射精"] as const;

const EROTIC_KEYWORDS = ["挿入", "奥まで", "ピストン", "喘", "あえ", "腰を振", "濡れ"] as const;

const INTIMATE_KEYWORDS = ["キス", "抱きしめ", "胸", "乳首", "舐め", "脱が"] as const;

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const extractMatches = (source: string, pattern: RegExp): string[] => {
  const matches = source.match(pattern);
  return matches ? matches.map((entry) => entry.trim()) : [];
};

const detectPhaseLabel = (source: string): string => {
  if (AFTERGLOW_KEYWORDS.some((keyword) => source.includes(keyword))) return "afterglow 寄り";
  if (CLIMAX_KEYWORDS.some((keyword) => source.includes(keyword))) return "climax 寄り";
  if (EROTIC_KEYWORDS.some((keyword) => source.includes(keyword))) return "erotic 寄り";
  if (INTIMATE_KEYWORDS.some((keyword) => source.includes(keyword))) return "intimate 寄り";
  return "conversation 寄り";
};

const buildSummary = (middle: CompressedMessage[], currentTurn: number): string => {
  const source = middle.map((message) => message.content).join("\n");

  const names = unique(
    CHARACTER_NAME_PATTERNS.flatMap((pattern) => extractMatches(source, pattern)),
  ).slice(0, 3);
  const locations = LOCATION_KEYWORDS.filter((keyword) => source.includes(keyword)).slice(0, 3);
  const relations = RELATION_KEYWORDS.filter((keyword) => source.includes(keyword)).slice(0, 3);
  const phaseLabel = detectPhaseLabel(source);

  const parts = [
    names.length > 0 ? `登場人物は${names.join("、")}` : "登場人物は継続中の二人",
    locations.length > 0 ? `場所は${locations.join("・")}` : "場所は明示なし",
    relations.length > 0 ? `関係は${relations.join("・")}` : "関係性は継続",
    `空気は${phaseLabel}`,
  ];

  return `【要約: T2-T${currentTurn - RECENT_TURN_COUNT} で${parts.join("。")}。】`;
};

export function compressIfNeeded(
  turns: CompressedMessage[],
  currentTurn: number,
): CompressedMessage[] {
  // 15ターン未満は素直に保持し、圧縮差分そのものが挙動ノイズになるのを避ける。
  if (currentTurn <= 15) {
    return turns;
  }

  if (turns.length <= RECENT_MESSAGE_COUNT + 1) {
    return turns;
  }

  const firstMessage = turns[0];
  const recentMessages = turns.slice(-RECENT_MESSAGE_COUNT);
  const middleMessages = turns.slice(1, -RECENT_MESSAGE_COUNT);

  if (middleMessages.length === 0) {
    return turns;
  }

  // 先頭の導入を残しつつ、中盤だけを 1 メッセージ要約に潰す。
  return [
    firstMessage,
    {
      role: "assistant",
      content: buildSummary(middleMessages, currentTurn),
      turnIndex: middleMessages[0]?.turnIndex ?? 2,
    },
    ...recentMessages,
  ];
}
