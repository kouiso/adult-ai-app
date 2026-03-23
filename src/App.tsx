import { useEffect } from 'react'
import { ChatView } from '@/components/chat/ChatView'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { useSettingsStore } from '@/stores/settings-store'
import { Toaster } from '@/components/ui/sonner'

export default function App() {
  const darkMode = useSettingsStore((s) => s.darkMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">AI チャット</h1>
        <SettingsPanel />
      </header>
      <main className="flex-1 overflow-hidden">
        <ChatView />
      </main>
      <Toaster />
    </div>
  )
}
