import { useEffect, useState } from "react";

import { CharacterManager } from "@/component/character/character-manager";
import { ChatView } from "@/component/chat/chat-view";
import { AgeGateModal } from "@/component/legal/age-gate-modal";
import { PrivacyPolicy } from "@/component/legal/privacy-policy";
import { TermsOfService } from "@/component/legal/terms-of-service";
import { Tokushoho } from "@/component/legal/tokushoho";
import { SettingsPanel } from "@/component/settings/settings-panel";
import { Toaster } from "@/component/ui/sonner";
import { useSettingsStore } from "@/store/settings-store";

const LEGAL_ROUTES = {
  tos: "/legal/tos",
  tokushoho: "/legal/tokushoho",
  privacy: "/legal/privacy",
} as const;

type LegalRoute = (typeof LEGAL_ROUTES)[keyof typeof LEGAL_ROUTES];
type AppRoute = "chat" | LegalRoute;

const parseHashRoute = (hash: string): AppRoute => {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;

  switch (normalized) {
    case LEGAL_ROUTES.tos:
      return LEGAL_ROUTES.tos;
    case LEGAL_ROUTES.tokushoho:
      return LEGAL_ROUTES.tokushoho;
    case LEGAL_ROUTES.privacy:
      return LEGAL_ROUTES.privacy;
    default:
      return "chat";
  }
};

const getPageTitle = (route: AppRoute): string => {
  switch (route) {
    case LEGAL_ROUTES.tos:
      return "利用規約";
    case LEGAL_ROUTES.tokushoho:
      return "特定商取引法表示";
    case LEGAL_ROUTES.privacy:
      return "プライバシーポリシー";
    default:
      return "AI チャット";
  }
};

const renderPageContent = (route: AppRoute) => {
  switch (route) {
    case LEGAL_ROUTES.tos:
      return <TermsOfService />;
    case LEGAL_ROUTES.tokushoho:
      return <Tokushoho />;
    case LEGAL_ROUTES.privacy:
      return <PrivacyPolicy />;
    default:
      return <ChatView />;
  }
};

export const App = () => {
  const darkMode = useSettingsStore((s) => s.darkMode);
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute(window.location.hash));
  const [isAgeDenied, setIsAgeDenied] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const pageTitle = getPageTitle(route);
  const pageContent = renderPageContent(route);

  if (isAgeDenied) {
    return <div className="min-h-svh bg-background" />;
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between bg-gradient-header px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate font-narrative text-lg font-semibold tracking-wide text-white/95">{pageTitle}</h1>
          {route !== "chat" ? (
            <a
              href="#/"
              className="text-xs text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              チャットに戻る
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-1 text-white/90">
          {route === "chat" ? (
            <>
              <CharacterManager />
              <SettingsPanel />
            </>
          ) : null}
        </div>
      </header>
      <main className={route === "chat" ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto"}>
        {pageContent}
      </main>
      <AgeGateModal onDenied={() => setIsAgeDenied(true)} />
      <Toaster />
    </div>
  );
};
