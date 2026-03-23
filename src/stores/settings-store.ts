import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  model: string
  nsfwBlur: boolean
  darkMode: boolean
  autoGenerateImages: boolean
  setModel: (model: string) => void
  toggleNsfwBlur: () => void
  toggleDarkMode: () => void
  toggleAutoGenerateImages: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      model: 'mistralai/mistral-nemo',
      nsfwBlur: true,
      darkMode: true,
      autoGenerateImages: false,
      setModel: (model) => set({ model }),
      toggleNsfwBlur: () => set((s) => ({ nsfwBlur: !s.nsfwBlur })),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      toggleAutoGenerateImages: () => set((s) => ({ autoGenerateImages: !s.autoGenerateImages })),
    }),
    { name: 'ai-chat-settings' }
  )
)
