import { chromium } from "playwright";

import type { E2eEnv } from "./env";
import type { Browser, BrowserContext } from "playwright";

export type E2eBrowser = {
  browser: Browser;
  connectedAt: string;
  cdpPort: number;
  mode: "cdp" | "launch";
};

const DEFAULT_VIEWPORT = {
  width: 1280,
  height: 900,
} as const;

const shouldRunHeadless = (): boolean => process.env.E2E_HEADLESS !== "false";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const connectBrowser = async (env: E2eEnv): Promise<E2eBrowser> => {
  const endpoint = `http://localhost:${env.cdpPort}`;
  console.error(`[browser] connect cdp=${endpoint}`);

  try {
    const browser = await chromium.connectOverCDP(endpoint);
    browser.on("disconnected", () => {
      console.error(`[browser] disconnected cdp=${endpoint}`);
    });

    return {
      browser,
      connectedAt: new Date().toISOString(),
      cdpPort: env.cdpPort,
      mode: "cdp",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[browser] cdp unavailable, falling back to local launch: ${message}`);
    const headless = shouldRunHeadless();
    console.error(`[browser] local launch headless=${headless}`);
    const browser = await chromium.launch({ headless });
    browser.on("disconnected", () => {
      console.error("[browser] disconnected local-launch");
    });
    return {
      browser,
      connectedAt: new Date().toISOString(),
      cdpPort: env.cdpPort,
      mode: "launch",
    };
  }
};

export const createContext = async (browser: Browser): Promise<BrowserContext> =>
  browser.newContext({
    locale: "ja-JP",
    viewport: DEFAULT_VIEWPORT,
  });

export const closeContext = async (ctx: BrowserContext): Promise<void> => {
  await ctx.close();
};

export const heartbeat = async (browser: Browser): Promise<boolean> => browser.isConnected();

export const staggeredDelay = async (index: number, stepSeconds: number): Promise<void> => {
  const delayMs = Math.max(0, index) * Math.max(0, stepSeconds) * 1000;
  await sleep(delayMs);
};
