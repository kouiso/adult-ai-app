import type { Page } from "playwright";

export const TURN_TIMEOUT_MS = 180_000;
export const SCENARIO_TIMEOUT_MS = 1_200_000;
export const RUN_TIMEOUT_MS = 3_600_000;

const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const STREAM_STABLE_MS = 500;
const POLL_INTERVAL_MS = 100;
const MESSAGE_GROUP_SELECTOR = ".group\\/message";
const BUBBLE_SELECTOR = ".rounded-2xl";

interface ProbeSnapshot {
  installedAt: number | null;
  lastChatRequestAt: number | null;
  firstChunkAt: number | null;
  lastChunkAt: number | null;
  doneChunkAt: number | null;
}

interface AssistantSnapshot {
  exists: boolean;
  text: string;
  messageCount: number;
  hasUiDone: boolean;
}

interface ImageSnapshot {
  naturalWidth: number;
  src: string | null;
}

interface MessageCountSnapshot {
  count: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readBoolean = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

const readString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const parseProbeSnapshot = (value: unknown): ProbeSnapshot => {
  if (!isRecord(value)) {
    return {
      installedAt: null,
      lastChatRequestAt: null,
      firstChunkAt: null,
      lastChunkAt: null,
      doneChunkAt: null,
    };
  }

  return {
    installedAt: readFiniteNumber(value.installedAt),
    lastChatRequestAt: readFiniteNumber(value.lastChatRequestAt),
    firstChunkAt: readFiniteNumber(value.firstChunkAt),
    lastChunkAt: readFiniteNumber(value.lastChunkAt),
    doneChunkAt: readFiniteNumber(value.doneChunkAt),
  };
};

const parseAssistantSnapshot = (value: unknown): AssistantSnapshot => {
  if (!isRecord(value)) {
    return {
      exists: false,
      text: "",
      messageCount: 0,
      hasUiDone: false,
    };
  }

  return {
    exists: readBoolean(value.exists) ?? false,
    text: readString(value.text) ?? "",
    messageCount: readFiniteNumber(value.messageCount) ?? 0,
    hasUiDone: readBoolean(value.hasUiDone) ?? false,
  };
};

const parseImageSnapshot = (value: unknown): ImageSnapshot => {
  if (!isRecord(value)) {
    return { naturalWidth: 0, src: null };
  }

  return {
    naturalWidth: readFiniteNumber(value.naturalWidth) ?? 0,
    src: readString(value.src),
  };
};

const parseMessageCountSnapshot = (value: unknown): MessageCountSnapshot => {
  if (!isRecord(value)) {
    return { count: 0 };
  }

  return {
    count: readFiniteNumber(value.count) ?? 0,
  };
};

const ensureStreamProbe = async (page: Page): Promise<void> => {
  await page.evaluate(`
    (() => {
      const key = "__adultAiE2eStreamProbe";
      const scope = window;
      if (scope[key]) {
        return;
      }

      const state = {
        installedAt: Date.now(),
        lastChatRequestAt: null,
        firstChunkAt: null,
        lastChunkAt: null,
        doneChunkAt: null,
      };

      const originalFetch = window.fetch.bind(window);
      const parseUrl = (input) => {
        if (typeof input === "string") return input;
        if (input instanceof URL) return input.toString();
        if (input && typeof input === "object" && "url" in input && typeof input.url === "string") {
          return input.url;
        }
        return "";
      };

      const inspectResponse = async (response) => {
        try {
          const cloned = response.clone();
          if (!cloned.body) {
            return;
          }
          const reader = cloned.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
              break;
            }
            if (!chunk.value) {
              continue;
            }

            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split("\\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) {
                continue;
              }
              const payload = line.slice(6).trim();
              if (!payload) {
                continue;
              }

              const now = Date.now();
              if (state.firstChunkAt === null && payload !== "[DONE]") {
                state.firstChunkAt = now;
              }
              if (payload === "[DONE]") {
                state.doneChunkAt = now;
              } else {
                state.lastChunkAt = now;
              }
            }
          }
        } catch {
          return;
        }
      };

      window.fetch = async (...args) => {
        const url = parseUrl(args[0]);
        const response = await originalFetch(...args);
        if (url.includes("/api/chat")) {
          state.lastChatRequestAt = Date.now();
          state.firstChunkAt = null;
          state.lastChunkAt = null;
          state.doneChunkAt = null;
          void inspectResponse(response);
        }
        return response;
      };

      scope[key] = state;
    })()
  `);
};

const readProbeSnapshot = async (page: Page): Promise<ProbeSnapshot> => {
  const raw = await page.evaluate(`
    (() => {
      const state = window.__adultAiE2eStreamProbe;
      if (!state) {
        return null;
      }
      return {
        installedAt: state.installedAt,
        lastChatRequestAt: state.lastChatRequestAt,
        firstChunkAt: state.firstChunkAt,
        lastChunkAt: state.lastChunkAt,
        doneChunkAt: state.doneChunkAt,
      };
    })()
  `);
  return parseProbeSnapshot(raw);
};

const readAssistantSnapshot = async (page: Page): Promise<AssistantSnapshot> => {
  const raw = await page.evaluate(`
    (() => {
      const groups = Array.from(document.querySelectorAll(${JSON.stringify(MESSAGE_GROUP_SELECTOR)}));
      const assistantGroups = groups.filter((node) => !node.classList.contains("flex-row-reverse"));
      const last = assistantGroups.at(-1);
      if (!last) {
        return { exists: false, text: "", messageCount: assistantGroups.length, hasUiDone: false };
      }

      const bubble = last.querySelector(${JSON.stringify(BUBBLE_SELECTOR)});
      const text = bubble?.textContent?.trim() ?? "";
      const hasStreamingDots = Boolean(last.querySelector(".animate-bounce"));
      const hasReadyActions = Boolean(
        last.querySelector('button[aria-label="再生成"], button[aria-label="再試行"]'),
      );

      return {
        exists: true,
        text,
        messageCount: assistantGroups.length,
        hasUiDone: hasReadyActions && !hasStreamingDots,
      };
    })()
  `);
  return parseAssistantSnapshot(raw);
};

const readImageSnapshot = async (page: Page, imgSelector: string): Promise<ImageSnapshot> => {
  const raw = await page.evaluate(`
    (() => {
      const img = document.querySelector(${JSON.stringify(imgSelector)});
      if (!(img instanceof HTMLImageElement)) {
        return { naturalWidth: 0, src: null };
      }
      return {
        naturalWidth: img.naturalWidth,
        src: img.currentSrc || img.src || null,
      };
    })()
  `);
  return parseImageSnapshot(raw);
};

const readMessageCount = async (page: Page): Promise<number> => {
  const raw = await page.evaluate(`
    (() => ({
      count: document.querySelectorAll(${JSON.stringify(MESSAGE_GROUP_SELECTOR)}).length,
    }))()
  `);
  return parseMessageCountSnapshot(raw).count;
};

const toAbsoluteUrl = (pageUrl: string, src: string): string => {
  try {
    return new URL(src, pageUrl).toString();
  } catch {
    return src;
  }
};

const readContentType = async (page: Page, src: string): Promise<string | null> => {
  try {
    const response = await page.context().request.get(src, {
      failOnStatusCode: false,
      timeout: DEFAULT_WAIT_TIMEOUT_MS,
    });
    return response.headers()["content-type"] ?? null;
  } catch {
    return null;
  }
};

export const waitForDomReady = async (
  page: Page,
  selector: string,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<void> => {
  await page.waitForSelector(selector, {
    state: "visible",
    timeout: timeoutMs,
  });
};

export const waitForStreamComplete = async (
  page: Page,
  timeoutMs = TURN_TIMEOUT_MS,
): Promise<{
  firstTokenMs: number | null;
  lastChunkMs: number | null;
  hasDoneSignal: boolean;
}> => {
  await ensureStreamProbe(page);

  const startedAt = Date.now();
  let firstTokenMs: number | null = null;
  let lastChunkMs: number | null = null;
  let previousText = "";
  let stableSince = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const [probe, assistant] = await Promise.all([
      readProbeSnapshot(page),
      readAssistantSnapshot(page),
    ]);
    const now = Date.now();

    if (assistant.text !== previousText) {
      previousText = assistant.text;
      stableSince = now;
      if (assistant.text.length > 0) {
        if (firstTokenMs === null) {
          firstTokenMs = now - startedAt;
        }
        lastChunkMs = now - startedAt;
      }
    }

    const probeBase = probe.lastChatRequestAt ?? probe.installedAt;
    if (probeBase !== null && probe.firstChunkAt !== null) {
      firstTokenMs = Math.max(0, probe.firstChunkAt - probeBase);
    }
    if (probeBase !== null && probe.lastChunkAt !== null) {
      lastChunkMs = Math.max(0, probe.lastChunkAt - probeBase);
    }

    const hasDoneSignal = probe.doneChunkAt !== null;
    const stableForMs = now - stableSince;
    const hasFallbackDone = assistant.hasUiDone && stableForMs >= STREAM_STABLE_MS;

    if (hasDoneSignal && assistant.hasUiDone) {
      return { firstTokenMs, lastChunkMs, hasDoneSignal: true };
    }
    if (hasFallbackDone) {
      return { firstTokenMs, lastChunkMs, hasDoneSignal };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`stream complete wait timed out after ${timeoutMs}ms`);
};

export const waitForImageLoaded = async (
  page: Page,
  imgSelector: string,
  timeoutMs = TURN_TIMEOUT_MS,
): Promise<{
  naturalWidth: number;
  contentType: string | null;
}> => {
  await page.waitForSelector(imgSelector, {
    state: "attached",
    timeout: timeoutMs,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = await readImageSnapshot(page, imgSelector);
    if (snapshot.naturalWidth > 0 && snapshot.src) {
      const absoluteSrc = toAbsoluteUrl(page.url(), snapshot.src);
      const contentType = await readContentType(page, absoluteSrc);
      return {
        naturalWidth: snapshot.naturalWidth,
        contentType,
      };
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`image load wait timed out after ${timeoutMs}ms for selector: ${imgSelector}`);
};

export const waitForMessageCount = async (
  page: Page,
  expected: number,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<number> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const count = await readMessageCount(page);
    if (count >= expected) {
      return count;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`message count wait timed out after ${timeoutMs}ms, expected=${expected}`);
};
