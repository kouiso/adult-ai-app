export const DEFAULT_CHAT_MODEL = "anthropic/claude-opus-4-20250514" as const;

// 既定モデルがOpenRouter側で利用不能なときだけ順に退避する。
// 理由: 実在確認できた高品質モデルだけで安全にフォールバックさせたい。
export const DEFAULT_CHAT_MODEL_FALLBACKS = [
  "anthracite-org/magnum-v4-72b",
  "anthropic/claude-sonnet-4-20250514",
  "qwen/qwen-2.5-72b-instruct",
  "deepseek/deepseek-chat",
] as const;

// API入力で許可する一覧と、サーバー内部でのみ使う退避先は役割が異なる。
// 理由: UIの選択肢を増やさずに、サーバー再試行だけを安全に強化したい。
export const MODEL_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  [DEFAULT_CHAT_MODEL]: DEFAULT_CHAT_MODEL_FALLBACKS,
  "anthropic/claude-sonnet-4-20250514": [
    DEFAULT_CHAT_MODEL,
    "anthracite-org/magnum-v4-72b",
    "qwen/qwen-2.5-72b-instruct",
    "deepseek/deepseek-chat",
  ],
  "anthropic/claude-haiku-4-5-20251001": [
    DEFAULT_CHAT_MODEL,
    "anthropic/claude-sonnet-4-20250514",
    "anthracite-org/magnum-v4-72b",
  ],
  "qwen/qwen-2.5-72b-instruct": [
    DEFAULT_CHAT_MODEL,
    "anthracite-org/magnum-v4-72b",
    "deepseek/deepseek-chat",
  ],
  "deepseek/deepseek-chat": [
    DEFAULT_CHAT_MODEL,
    "anthracite-org/magnum-v4-72b",
    "qwen/qwen-2.5-72b-instruct",
  ],
  "anthracite-org/magnum-v4-72b": [
    DEFAULT_CHAT_MODEL,
    "qwen/qwen-2.5-72b-instruct",
    "deepseek/deepseek-chat",
  ],
};

export const DEFAULT_FALLBACK_MODELS = [
  DEFAULT_CHAT_MODEL,
  ...DEFAULT_CHAT_MODEL_FALLBACKS,
] as const;

export const MODEL_CATALOG = [
  // ── 推奨 ────────────────────────────────────────────────────────────────
  {
    id: "anthropic/claude-opus-4-20250514",
    name: "Claude Opus 4 ⭐ 推奨",
    tier: "推奨",
    desc: "最高品質（推奨）",
  },
  {
    id: "anthropic/claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    tier: "推奨",
    desc: "高品質・高速",
  },
  {
    id: "anthropic/claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    tier: "推奨",
    desc: "高速・軽量",
  },
  // ── 無料 ────────────────────────────────────────────────────────────────
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    name: "Venice Uncensored（無料）",
    tier: "無料",
    desc: "24B・制限なし・アダルトOK",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    name: "Hermes 3 405B（無料）",
    tier: "無料",
    desc: "405B・高品質・アンセンサード",
  },
  // ── スタンダード ─────────────────────────────────────────────────────────
  {
    id: "thedrummer/unslopnemo-12b",
    name: "UnslopNemo 12B",
    tier: "スタンダード",
    desc: "RP特化・アダルトOK",
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax 13B",
    tier: "スタンダード",
    desc: "クラシックRP向け・アダルトOK",
  },
  {
    id: "undi95/toppy-m-7b",
    name: "Toppy M 7B",
    tier: "スタンダード",
    desc: "軽量・高速・アンセンサード",
  },
  // ── プレミアム ───────────────────────────────────────────────────────────
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3 ⭐ 推奨",
    tier: "プレミアム",
    desc: "RPランキング1位・164k文脈・安定・$0.26/M",
  },
  {
    id: "sao10k/l3.3-euryale-70b",
    name: "Euryale v3 70B",
    tier: "プレミアム",
    desc: "最新Euryale・RP/アダルト最高品質",
  },
  {
    id: "sao10k/l3.1-euryale-70b",
    name: "Euryale v2 70B",
    tier: "プレミアム",
    desc: "RP特化fine-tune・安定高品質",
  },
  {
    id: "sao10k/l3-euryale-70b",
    name: "Euryale v1 70B",
    tier: "プレミアム",
    desc: "Euryale旧版・実績あり",
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B Instruct ⭐ 推奨",
    tier: "プレミアム",
    desc: "日本語ネイティブ・指示追従性最高・安定出力",
  },
  {
    id: "anthracite-org/magnum-v4-72b",
    name: "Magnum v4 72B ⭐ 推奨",
    tier: "プレミアム",
    desc: "官能描写特化・高文章品質",
  },
  {
    id: "nousresearch/hermes-4-70b",
    name: "Hermes 4 70B",
    tier: "プレミアム",
    desc: "最新Hermes・汎用高品質",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    name: "Hermes 3 70B",
    tier: "プレミアム",
    desc: "アンセンサード・汎用",
  },
] as const;

// z.enum()が要求する非空タプル型をas無しで導出する
type ModelId = (typeof MODEL_CATALOG)[number]["id"];

function extractModelIds<T extends readonly { id: string }[]>(
  catalog: T,
): [T[0]["id"], ...T[number]["id"][]] {
  const [first, ...rest] = catalog.map((m) => m.id);
  return [first, ...rest];
}

export const ALLOWED_MODELS: readonly [ModelId, ...ModelId[]] = extractModelIds(MODEL_CATALOG);

export type AllowedModel = ModelId;
