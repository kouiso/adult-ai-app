import { useCallback, useEffect, useRef, useState } from "react";

type VoiceType = "female" | "male" | "other";

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

const FEMALE_PATTERNS = [
  /kyoko/i,
  /o-ren/i,
  /nanami/i,
  /haruka/i,
  /sayaka/i,
  /ayumi/i,
  /female/i,
  /woman/i,
  /keiko/i,
  /misaki/i,
  /mei-jia/i,
  /ting-ting/i,
];

const MALE_PATTERNS = [
  /otoya/i,
  /ichiro/i,
  /hattori/i,
  /male/i,
  /man\b/i,
  /takumi/i,
  /kenta/i,
  /ryo/i,
];

const categorizeVoice = (voice: SpeechSynthesisVoice): VoiceType => {
  const name = voice.name;
  if (FEMALE_PATTERNS.some((p) => p.test(name))) return "female";
  if (MALE_PATTERNS.some((p) => p.test(name))) return "male";
  return "other";
};

const TYPE_LABELS: Record<VoiceType, string> = {
  female: "👩 女性",
  male: "👨 男性",
  other: "🔊 その他",
} as const;

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
  });

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
