export const MODEL_CATALOG = [
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    name: "Venice Uncensored（無料）",
    tier: "無料",
    desc: "24Bモデル・制限なし",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    name: "Hermes 3 405B（無料）",
    tier: "無料",
    desc: "405Bモデル・高品質",
  },
  {
    id: "mistralai/mistral-nemo",
    name: "Mistral Nemo 12B",
    tier: "スタンダード",
    desc: "高速・低コスト",
  },
  {
    id: "thedrummer/unslopnemo-12b",
    name: "UnslopNemo 12B（RP向け）",
    tier: "スタンダード",
    desc: "ロールプレイ特化",
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax 13B（RP向け）",
    tier: "スタンダード",
    desc: "ロールプレイ向け・13B",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    name: "Hermes 3 70B",
    tier: "プレミアム",
    desc: "高品質・汎用",
  },
  {
    id: "nousresearch/hermes-4-70b",
    name: "Hermes 4 70B",
    tier: "プレミアム",
    desc: "最新・最高品質",
  },
  {
    id: "sao10k/l3.1-euryale-70b",
    name: "Euryale 70B（RP最強）",
    tier: "プレミアム",
    desc: "RP特化fine-tune済み70B・業界最高品質",
  },
  {
    id: "sao10k/l3-euryale-70b",
    name: "Euryale 70B v2（RP）",
    tier: "プレミアム",
    desc: "Euryale旧版・安定した人気モデル",
  },
] as const;

export const ALLOWED_MODELS = MODEL_CATALOG.map((m) => m.id) as unknown as readonly [
  (typeof MODEL_CATALOG)[number]["id"],
  ...(typeof MODEL_CATALOG)[number]["id"][],
];

export type AllowedModel = (typeof MODEL_CATALOG)[number]["id"];
