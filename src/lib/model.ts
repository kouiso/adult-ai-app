export const MODEL_CATALOG = [
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
    id: "anthracite-org/magnum-v4-72b",
    name: "Magnum v4 72B",
    tier: "プレミアム",
    desc: "官能描写特化・高文章品質",
  },
  {
    id: "eva-unit-01/eva-qwen2.5-72b",
    name: "EVA Qwen2.5 72B ⭐ 推奨",
    tier: "プレミアム",
    desc: "Qwen2.5ベース・日本語ネイティブ・ERP特化",
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B Instruct ⭐ 推奨",
    tier: "プレミアム",
    desc: "日本語ネイティブ・指示追従性最高・安定出力",
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
