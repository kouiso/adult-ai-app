import { useEffect, useState } from "react";

import { LoginForm } from "@/component/auth/login-form";
import { CharacterManager } from "@/component/character/character-manager";
import { ChatView } from "@/component/chat/chat-view";
import { AgeGateModal } from "@/component/legal/age-gate-modal";
import { PrivacyPolicy } from "@/component/legal/privacy-policy";
import { TermsOfService } from "@/component/legal/terms-of-service";
import { Tokushoho } from "@/component/legal/tokushoho";
import { SettingsPanel } from "@/component/settings/settings-panel";
import { Toaster } from "@/component/ui/sonner";
import { AUTH_TOKEN_INVALID_EVENT } from "@/lib/api";
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

const hasStoredAuthToken = (): boolean => Boolean(localStorage.getItem("auth_token"));

const renderPageContent = (
  route: AppRoute,
  onOpenCharacterManager: () => void,
  onOpenManualCharacterCreate: () => void,
) => {
  switch (route) {
    case LEGAL_ROUTES.tos:
      return <TermsOfService />;
    case LEGAL_ROUTES.tokushoho:
      return <Tokushoho />;
    case LEGAL_ROUTES.privacy:
      return <PrivacyPolicy />;
    default:
      return (
        <ChatView
          onOpenCharacterManager={onOpenCharacterManager}
          onOpenManualCharacterCreate={onOpenManualCharacterCreate}
        />
      );
  }
};

export const App = () => {
  const darkMode = useSettingsStore((s) => s.darkMode);
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasStoredAuthToken());
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute(window.location.hash));
  const [isAgeDenied, setIsAgeDenied] = useState(false);
  // ヘッダーの小さな Users アイコンに加えて、EmptyState の大きなボタンからも
  // CharacterManager Sheet を開けるよう open 状態を親で持つ
  const [isCharacterManagerOpen, setCharacterManagerOpen] = useState(false);
  const [manualCreateSignal, setManualCreateSignal] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handleAuthInvalid = () => {
      setIsAuthenticated(false);
    };

    window.addEventListener(AUTH_TOKEN_INVALID_EVENT, handleAuthInvalid);
    return () => {
      window.removeEventListener(AUTH_TOKEN_INVALID_EVENT, handleAuthInvalid);
    };
  }, []);

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
  const openManualCharacterCreate = () => setManualCreateSignal((n) => n + 1);
  const pageContent = renderPageContent(
    route,
    () => setCharacterManagerOpen(true),
    openManualCharacterCreate,
  );

  if (isAgeDenied) {
    return <div className="min-h-svh bg-background" />;
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between bg-gradient-header px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate font-narrative text-lg font-semibold tracking-wide text-white/95">
            {pageTitle}
          </h1>
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
              <CharacterManager
                open={isCharacterManagerOpen}
                onOpenChange={setCharacterManagerOpen}
                manualCreateSignal={manualCreateSignal}
              />
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
