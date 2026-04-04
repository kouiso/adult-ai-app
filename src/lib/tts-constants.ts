export type VoiceType =
  | "female-high"
  | "female-calm"
  | "male"
  | "synthetic"
  | "multilingual"
  | "other";

export interface CategorizedVoice {
  voice: SpeechSynthesisVoice;
  type: VoiceType;
  label: string;
}

export const VOICE_TYPE_ORDER: readonly VoiceType[] = [
  "female-high",
  "female-calm",
  "male",
  "synthetic",
  "multilingual",
  "other",
] as const;

export const TYPE_LABELS: Record<VoiceType, string> = {
  "female-high": "👩 女性（高め・明るい）",
  "female-calm": "👩 女性（落ち着き）",
  male: "👨 男性",
  synthetic: "🤖 合成音声",
  multilingual: "🌐 クラウド",
  other: "🔊 その他",
} as const;
