"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useSettingsStore } from "@/store/settings-store";

// ReactのCSSPropertiesにCSSカスタムプロパティ（--で始まる変数）のサポートを追加
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | undefined;
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  const darkMode = useSettingsStore((s) => s.darkMode);
  const theme = darkMode ? "dark" : "light";

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      }}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
