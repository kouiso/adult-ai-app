import { z } from "zod/v4";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Magnum v4 72B: エロ描写品質が圧倒的に上。Qwenはセルフ検閲でPG-13止まり。料金同一($0.34/1M tokens)
const DEFAULT_MODEL = "anthracite-org/magnum-v4-72b" as const;
const LEGACY_MODEL_NEMO = "mistralai/mistral-nemo" as const;
const LEGACY_MODEL_HERMES = "nousresearch/hermes-3-llama-3.1-405b:free" as const;
const LEGACY_MODEL_VENICE =
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free" as const;
const LEGACY_MODEL_EURYALE_V2 = "sao10k/l3.1-euryale-70b" as const;
const LEGACY_MODEL_EURYALE_V3 = "sao10k/l3.3-euryale-70b" as const;
const LEGACY_MODEL_EVA_QWEN = "eva-unit-01/eva-qwen2.5-72b" as const;
const LEGACY_MODEL_MAGNUM = "anthracite-org/magnum-v4-72b" as const;
const LEGACY_MODEL_DEEPSEEK = "deepseek/deepseek-chat" as const;

const persistedSettingsSchema = z.object({
  model: z.string().default(DEFAULT_MODEL),
  nsfwBlur: z.boolean().default(true),
  darkMode: z.boolean().default(true),
  autoGenerateImages: z.boolean().default(false),
  ttsEnabled: z.boolean().default(false),
  ttsVoiceUri: z.string().default(""),
  ttsRate: z.number().min(0.5).max(2).default(1),
  ttsPitch: z.number().min(0.5).max(2).default(1),
  activeCharacterId: z.string().nullable().default(null),
});

type PersistedSettings = z.infer<typeof persistedSettingsSchema>;

interface SettingsState {
  model: string;
  nsfwBlur: boolean;
  darkMode: boolean;
  autoGenerateImages: boolean;
  ttsEnabled: boolean;
  ttsVoiceUri: string;
  ttsRate: number;
  ttsPitch: number;
  activeCharacterId: string | null;
  setModel: (model: string) => void;
  toggleNsfwBlur: () => void;
  toggleDarkMode: () => void;
  toggleAutoGenerateImages: () => void;
  toggleTts: () => void;
  setTtsVoiceUri: (uri: string) => void;
  setTtsRate: (rate: number) => void;
  setTtsPitch: (pitch: number) => void;
  setActiveCharacterId: (id: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      model: DEFAULT_MODEL,
      nsfwBlur: true,
      darkMode: true,
      autoGenerateImages: false,
      ttsEnabled: false,
      ttsVoiceUri: "",
      ttsRate: 1,
      ttsPitch: 1,
      activeCharacterId: null,
      setModel: (model) => set({ model }),
      toggleNsfwBlur: () => set((s) => ({ nsfwBlur: !s.nsfwBlur })),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      toggleAutoGenerateImages: () => set((s) => ({ autoGenerateImages: !s.autoGenerateImages })),
      toggleTts: () => set((s) => ({ ttsEnabled: !s.ttsEnabled })),
      setTtsVoiceUri: (uri) => set({ ttsVoiceUri: uri }),
      setTtsRate: (rate) => set({ ttsRate: rate }),
      setTtsPitch: (pitch) => set({ ttsPitch: pitch }),
      setActiveCharacterId: (id) => set({ activeCharacterId: id }),
    }),
    {
      name: "ai-chat-settings",
      version: 20,
      migrate: (persistedState: unknown, version: number): PersistedSettings => {
        const result = persistedSettingsSchema.safeParse(persistedState);
        const parsed = result.success
          ? result.data
          : ({
              model: DEFAULT_MODEL,
              nsfwBlur: true,
              darkMode: true,
              autoGenerateImages: false,
              ttsEnabled: false,
              ttsVoiceUri: "",
              ttsRate: 1,
              ttsPitch: 1,
              activeCharacterId: null,
            } satisfies PersistedSettings);
        // attempt 6 model-switch-v2: Magnum v4 が長文で崩壊するため EVA-Qwen2.5-72B に移行
        if (
          (version < 2 && parsed.model === LEGACY_MODEL_NEMO) ||
          (version < 5 && parsed.model === LEGACY_MODEL_HERMES) ||
          (version < 6 && parsed.model === LEGACY_MODEL_VENICE) ||
          (version < 8 && parsed.model === LEGACY_MODEL_EURYALE_V2) ||
          (version < 10 && parsed.model === LEGACY_MODEL_EURYALE_V3) ||
          (version < 12 && parsed.model === LEGACY_MODEL_EVA_QWEN) ||
          (version < 14 && parsed.model === LEGACY_MODEL_MAGNUM) ||
          (version < 16 && parsed.model === LEGACY_MODEL_EURYALE_V3) ||
          (version < 18 && parsed.model === LEGACY_MODEL_MAGNUM) ||
          (version < 20 && parsed.model === LEGACY_MODEL_DEEPSEEK)
        ) {
          return { ...parsed, model: DEFAULT_MODEL };
        }
        return parsed;
      },
      partialize: (state): PersistedSettings => ({
        model: state.model,
        nsfwBlur: state.nsfwBlur,
        darkMode: state.darkMode,
        autoGenerateImages: state.autoGenerateImages,
        ttsEnabled: state.ttsEnabled,
        ttsVoiceUri: state.ttsVoiceUri,
        ttsRate: state.ttsRate,
        ttsPitch: state.ttsPitch,
        activeCharacterId: state.activeCharacterId,
      }),
      // localStorage quota超過やプライベートブラウジング時のエラーを吸収する
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            return localStorage.getItem(name);
          } catch {
            console.warn(`settings: localStorage.getItem("${name}") failed`);
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            console.warn(`settings: localStorage.setItem("${name}") failed (quota?)`);
          }
        },
        removeItem: (name: string) => {
          try {
            localStorage.removeItem(name);
          } catch {
            console.warn(`settings: localStorage.removeItem("${name}") failed`);
          }
        },
      })),
    },
  ),
);
