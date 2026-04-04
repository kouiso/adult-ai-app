import { useEffect } from "react";

import { CharacterManager } from "@/component/character/character-manager";
import { ChatView } from "@/component/chat/chat-view";
import { SettingsPanel } from "@/component/settings/settings-panel";
import { Toaster } from "@/component/ui/sonner";
import { useSettingsStore } from "@/store/settings-store";

export const App = () => {
  const darkMode = useSettingsStore((s) => s.darkMode);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between bg-gradient-header px-4 py-3 shadow-sm">
        <h1 className="text-lg font-semibold text-white">AI チャット</h1>
        <div className="flex items-center gap-1 text-white/90">
          <CharacterManager />
          <SettingsPanel />
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <ChatView />
      </main>
      <Toaster />
    </div>
  );
};
