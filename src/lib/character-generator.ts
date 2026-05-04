import { z } from "zod/v4";

import { apiFetch } from "@/lib/api";

// ── 属性チップの定義 ──────────────────────────────────────────────────────

export const CHIP_CATEGORIES = [
  {
    key: "types",
    label: "タイプ",
    chips: [
      "清楚系",
      "ギャル",
      "お姉さん",
      "ロリ系",
      "ボーイッシュ",
      "メンヘラ",
      "地味子",
      "お嬢様",
      "ヤンデレ",
      "JK",
      "JD",
    ],
  },
  {
    key: "relations",
    label: "関係性",
    chips: [
      "彼女",
      "先輩",
      "後輩",
      "先生",
      "幼馴染",
      "人妻",
      "メイド",
      "ナース",
      "同僚",
      "隣人",
      "義姉",
      "義妹",
    ],
  },
  {
    key: "personalities",
    label: "性格",
    chips: [
      "ツンデレ",
      "甘えん坊",
      "ドS",
      "ドM",
      "天然",
      "小悪魔",
      "従順",
      "強気",
      "内気",
      "クール",
      "母性的",
      "淫乱",
    ],
  },
  {
    key: "bodyTypes",
    label: "体型",
    chips: [
      "巨乳",
      "貧乳",
      "スレンダー",
      "ムチムチ",
      "低身長",
      "高身長",
      "黒髪",
      "金髪",
      "ショートヘア",
      "ロングヘア",
    ],
  },
] as const;

export const SITUATION_PRESETS = [
  "カフェで隣に座った",
  "マッチングアプリで出会った",
  "会社の同僚",
  "偶然の再会",
  "ナンパ",
  "宅配で来た",
  "家庭教師と生徒",
  "深夜のコンビニ",
  "飲み会で隣になった",
  "SNSのDMから",
] as const;

// ── API型定義 ────────────────────────────────────────────────────────────

export interface CharacterSelections {
  types: string[];
  relations: string[];
  personalities: string[];
  bodyTypes: string[];
  freeText: string;
}

export interface GenerateCharacterInput {
  selections: CharacterSelections;
  situation: string;
  details: string;
  model: string;
  previousResult?: GeneratedCharacter;
  feedback?: string;
}

const generatedCharacterSchema = z.object({
  name: z.string(),
  personality: z.string(),
  scenario: z.string(),
  greeting: z.string(),
  tags: z.array(z.string()),
});

export type GeneratedCharacter = z.infer<typeof generatedCharacterSchema>;

// ── API呼び出し ─────────────────────────────────────────────────────────

export async function generateCharacter(
  input: GenerateCharacterInput,
): Promise<GeneratedCharacter> {
  const response = await apiFetch("/api/generate-character", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`キャラクター生成に失敗しました: ${errorBody}`);
  }

  const data: unknown = await response.json();
  return generatedCharacterSchema.parse(data);
}
