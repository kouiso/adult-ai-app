import { z } from "zod/v4";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Qwen 2.5 72B: 100%安定した日本語出力。Magnumは25%しかクリーン出力できない
const DEFAULT_MODEL = "qwen/qwen-2.5-72b-instruct" as const;

// バージョンごとの廃止モデル → DEFAULT_MODELへの移行テーブル
const LEGACY_MODEL_MIGRATIONS: [number, string][] = [
  [2, "mistralai/mistral-nemo"],
  [5, "nousresearch/hermes-3-llama-3.1-405b:free"],
  [6, "cognitivecomputations/dolphin-mistral-24b-venice-edition:free"],
  [8, "sao10k/l3.1-euryale-70b"],
  [10, "sao10k/l3.3-euryale-70b"],
  [12, "eva-unit-01/eva-qwen2.5-72b"],
  [14, "anthracite-org/magnum-v4-72b"],
  [16, "sao10k/l3.3-euryale-70b"],
  [18, "anthracite-org/magnum-v4-72b"],
  [20, "deepseek/deepseek-chat"],
];

function shouldMigrateModel(version: number, currentModel: string): boolean {
  return LEGACY_MODEL_MIGRATIONS.some(
    ([minVersion, legacyModel]) => version < minVersion && currentModel === legacyModel,
  );
}

const persistedSettingsSchema = z.object({
  model: z.string().default(DEFAULT_MODEL),
  nsfwBlur: z.boolean().default(false),
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
      nsfwBlur: false,
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
      version: 21,
      migrate: (persistedState: unknown, version: number): PersistedSettings => {
        const result = persistedSettingsSchema.safeParse(persistedState);
        const parsed = result.success
          ? result.data
          : ({
              model: DEFAULT_MODEL,
              nsfwBlur: false,
              darkMode: true,
              autoGenerateImages: false,
              ttsEnabled: false,
              ttsVoiceUri: "",
              ttsRate: 1,
              ttsPitch: 1,
              activeCharacterId: null,
            } satisfies PersistedSettings);
        // v21: アダルトアプリなのでぼかしデフォルトOFFに変更。既存ユーザーも移行
        if (version < 21 && parsed.nsfwBlur === true) {
          parsed.nsfwBlur = false;
        }
        if (shouldMigrateModel(version, parsed.model)) {
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
