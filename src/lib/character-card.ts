// キャラクターの演技指示カード
// systemPrompt内に【キャラカード】セクションとして埋め込む
// DB/スキーマ変更なしで品質ガード・プロンプトビルダーから参照可能

import type { ScenePhase } from "@/lib/scene-phase";

export interface CharacterCard {
  name: string;
  first_person: string;
  speech_endings: string[];
  verbal_tics: string[];
  forbidden_words: string[];
  emotional_arc: Record<ScenePhase, string>;
  sensory_focus: string[];
}

const CARD_MARKER = "【キャラカード】" as const;

// YAML風 key: value の静的パターン（security/detect-non-literal-regexp 回避）
const CARD_KEY_PATTERNS: Record<string, RegExp> = {
  name: /^name:\s*(.+)$/m,
  first_person: /^first_person:\s*(.+)$/m,
  speech_endings: /^speech_endings:\s*(.+)$/m,
  verbal_tics: /^verbal_tics:\s*(.+)$/m,
  forbidden_words: /^forbidden_words:\s*(.+)$/m,
  arc_conversation: /^arc_conversation:\s*(.+)$/m,
  arc_intimate: /^arc_intimate:\s*(.+)$/m,
  arc_erotic: /^arc_erotic:\s*(.+)$/m,
  arc_climax: /^arc_climax:\s*(.+)$/m,
  sensory_focus: /^sensory_focus:\s*(.+)$/m,
};

// systemPromptからキャラカードをパースする
// YAML風のkey: value形式で埋め込まれたデータを抽出
export function parseCharacterCard(systemPrompt: string): CharacterCard | null {
  const startIdx = systemPrompt.indexOf(CARD_MARKER);
  if (startIdx === -1) return null;

  const cardText = systemPrompt.slice(startIdx + CARD_MARKER.length);
  // 次のセクションマーカーまたは末尾まで
  const endIdx = cardText.search(/【[^】]+】/);
  const section = endIdx === -1 ? cardText : cardText.slice(0, endIdx);

  const getValue = (key: string): string => {
    const pattern = CARD_KEY_PATTERNS[key];
    if (!pattern) return "";
    const match = section.match(pattern);
    return match ? match[1].trim() : "";
  };

  const getArray = (key: string): string[] => {
    const val = getValue(key);
    if (!val) return [];
    return val
      .split(/[,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const name = getValue("name");
  if (!name) return null;

  return {
    name,
    first_person: getValue("first_person"),
    speech_endings: getArray("speech_endings"),
    verbal_tics: getArray("verbal_tics"),
    forbidden_words: getArray("forbidden_words"),
    emotional_arc: {
      conversation: getValue("arc_conversation"),
      intimate: getValue("arc_intimate"),
      erotic: getValue("arc_erotic"),
      climax: getValue("arc_climax"),
    },
    sensory_focus: getArray("sensory_focus"),
  };
}
