import { useCallback, useEffect, useRef, useState } from "react";

type VoiceType = "female-high" | "female-calm" | "male" | "synthetic" | "multilingual" | "other";

interface CategorizedVoice {
  voice: SpeechSynthesisVoice;
  type: VoiceType;
  label: string;
}

interface SpeechSynthesisHookResult {
  speak: (text: string) => void;
  stop: () => void;
  preview: (text: string, voice: SpeechSynthesisVoice) => void;
  isSpeaking: boolean;
  voices: SpeechSynthesisVoice[];
  categorizedVoices: CategorizedVoice[];
  isSupported: boolean;
}

// iOS PWA（standalone）ではspeechSynthesisがユーザージェスチャー内で
// 一度でも呼ばれないと後続のspeak()が無音になるため、空発話でウォームアップする
const warmUpSpeechSynthesis = () => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance("");
  utterance.volume = 0;
  speechSynthesis.speak(utterance);
  speechSynthesis.cancel();
};

// macOS: Kyoko(高め・明るい), O-Ren(Siri高め)
const FEMALE_HIGH_PATTERNS = [/kyoko/i, /o-ren/i, /sayaka/i, /misaki/i, /mei-jia/i];

// macOS: Nanami(Edge系・落ち着き), Haruka(低めの落ち着いた声)
// Windows: Nanami, Haruka, Ayumi
const FEMALE_CALM_PATTERNS = [/nanami/i, /haruka/i, /ayumi/i, /keiko/i, /ting-ting/i];

// macOS: Otoya(Siri男性), Hattori(Siri Enhanced男性)
const MALE_PATTERNS = [/otoya/i, /ichiro/i, /hattori/i, /takumi/i, /kenta/i, /ryo/i];

// Google/Edge/Chromeが提供する合成音声
const SYNTHETIC_PATTERNS = [/google/i, /microsoft.*online/i, /edge/i];

// 汎用パターンで性別判定
const GENERIC_FEMALE_PATTERNS = [/female/i, /woman/i];
const GENERIC_MALE_PATTERNS = [/male/i, /\bman\b/i];

const categorizeVoice = (voice: SpeechSynthesisVoice): VoiceType => {
  const name = voice.name;
  if (FEMALE_HIGH_PATTERNS.some((p) => p.test(name))) return "female-high";
  if (FEMALE_CALM_PATTERNS.some((p) => p.test(name))) return "female-calm";
  if (MALE_PATTERNS.some((p) => p.test(name))) return "male";
  if (SYNTHETIC_PATTERNS.some((p) => p.test(name))) return "synthetic";
  if (GENERIC_FEMALE_PATTERNS.some((p) => p.test(name))) return "female-high";
  if (GENERIC_MALE_PATTERNS.some((p) => p.test(name))) return "male";
  // localService=falseかつ上記に該当しない → クラウド系の多言語音声
  if (!voice.localService) return "multilingual";
  return "other";
};

const VOICE_TYPE_ORDER: readonly VoiceType[] = [
  "female-high",
  "female-calm",
  "male",
  "synthetic",
  "multilingual",
  "other",
] as const;

const TYPE_LABELS: Record<VoiceType, string> = {
  "female-high": "👩 女性（高め・明るい）",
  "female-calm": "👩 女性（落ち着き）",
  male: "👨 男性",
  synthetic: "🤖 合成音声",
  multilingual: "🌐 クラウド",
  other: "🔊 その他",
} as const;

export { TYPE_LABELS, VOICE_TYPE_ORDER };
export type { CategorizedVoice, VoiceType };

const categorizeVoices = (jaVoices: SpeechSynthesisVoice[]): CategorizedVoice[] =>
  jaVoices.map((voice) => {
    const type = categorizeVoice(voice);
    return { voice, type, label: `${TYPE_LABELS[type]} ${voice.name}` };
  });

export const useSpeechSynthesis = (
  voiceUri: string,
  rate: number,
  pitch: number,
  onEnd?: () => void,
): SpeechSynthesisHookResult => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [categorizedVoices, setCategorizedVoices] = useState<CategorizedVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onEndRef = useRef(onEnd);
  const warmedUpRef = useRef(false);
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const available = speechSynthesis.getVoices();
      setVoices(available);
      const jaVoices = available.filter((v) => v.lang.startsWith("ja"));
      setCategorizedVoices(categorizeVoices(jaVoices));
    };

    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) return;

      if (!warmedUpRef.current) {
        warmUpSpeechSynthesis();
        warmedUpRef.current = true;
      }

      stop();

      // マークダウン記法を除去して自然な読み上げにする
      const cleaned = text
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
        .replace(/#{1,6}\s/g, "")
        .replace(/[>`|~]/g, "")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/\n{2,}/g, "。")
        .replace(/\n/g, "、")
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.lang = "ja-JP";

      const selectedVoice = voices.find((v) => v.voiceURI === voiceUri);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
        onEndRef.current?.();
      };
      utterance.onerror = (event) => {
        // "canceled"はstop()による正常中断なので無視
        if (event.error !== "canceled") {
          console.error("Speech synthesis error:", event.error);
        }
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    },
    [isSupported, stop, rate, pitch, voiceUri, voices],
  );

  const preview = useCallback(
    (text: string, voice: SpeechSynthesisVoice) => {
      if (!isSupported || !text.trim()) return;

      if (!warmedUpRef.current) {
        warmUpSpeechSynthesis();
        warmedUpRef.current = true;
      }

      stop();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.lang = "ja-JP";
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      speechSynthesis.speak(utterance);
    },
    [isSupported, stop, rate, pitch],
  );

  useEffect(
    () => () => {
      if (isSupported) {
        speechSynthesis.cancel();
      }
    },
    [isSupported],
  );

  return { speak, stop, preview, isSpeaking, voices, categorizedVoices, isSupported };
};
