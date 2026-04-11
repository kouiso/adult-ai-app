import { z } from "zod/v4";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Magnum v4 72B は XML構造化出力で完全崩壊(0/8)したため Euryale v3 に変更
// Euryale v3 70B は3シナリオ×8ターンを2セット連続で100%PASSを実測
const DEFAULT_MODEL = "sao10k/l3.3-euryale-70b" as const;
const LEGACY_MODEL_NEMO = "mistralai/mistral-nemo" as const;
const LEGACY_MODEL_HERMES = "nousresearch/hermes-3-llama-3.1-405b:free" as const;
const LEGACY_MODEL_VENICE =
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free" as const;
const LEGACY_MODEL_EURYALE_V2 = "sao10k/l3.1-euryale-70b" as const;
const LEGACY_MODEL_MAGNUM_V4 = "anthracite-org/magnum-v4-72b" as const;

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
      version: 9,
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
        if (
          (version < 2 && parsed.model === LEGACY_MODEL_NEMO) ||
          (version < 5 && parsed.model === LEGACY_MODEL_HERMES) ||
          (version < 6 && parsed.model === LEGACY_MODEL_VENICE) ||
          (version < 8 && parsed.model === LEGACY_MODEL_EURYALE_V2) ||
          // Magnum v4 は XML構造化出力で完全崩壊する実測があったため Euryale v3 に強制移行
          (version < 9 && parsed.model === LEGACY_MODEL_MAGNUM_V4)
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
