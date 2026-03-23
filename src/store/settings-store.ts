import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition:free" as const;
const LEGACY_DEFAULT_MODEL = "mistralai/mistral-nemo" as const;

const persistedSettingsSchema = z.object({
  model: z.string().default(DEFAULT_MODEL),
  nsfwBlur: z.boolean().default(true),
  darkMode: z.boolean().default(true),
  autoGenerateImages: z.boolean().default(false),
  ttsEnabled: z.boolean().default(false),
  ttsVoiceUri: z.string().default(""),
  ttsRate: z.number().min(0.5).max(2).default(1),
  ttsPitch: z.number().min(0.5).max(2).default(1),
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
  setModel: (model: string) => void;
  toggleNsfwBlur: () => void;
  toggleDarkMode: () => void;
  toggleAutoGenerateImages: () => void;
  toggleTts: () => void;
  setTtsVoiceUri: (uri: string) => void;
  setTtsRate: (rate: number) => void;
  setTtsPitch: (pitch: number) => void;
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
      setModel: (model) => set({ model }),
      toggleNsfwBlur: () => set((s) => ({ nsfwBlur: !s.nsfwBlur })),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      toggleAutoGenerateImages: () => set((s) => ({ autoGenerateImages: !s.autoGenerateImages })),
      toggleTts: () => set((s) => ({ ttsEnabled: !s.ttsEnabled })),
      setTtsVoiceUri: (uri) => set({ ttsVoiceUri: uri }),
      setTtsRate: (rate) => set({ ttsRate: rate }),
      setTtsPitch: (pitch) => set({ ttsPitch: pitch }),
    }),
    {
      name: "ai-chat-settings",
      version: 3,
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
            } satisfies PersistedSettings);
        if (version < 2 && parsed.model === LEGACY_DEFAULT_MODEL) {
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
      }),
    },
  ),
);
