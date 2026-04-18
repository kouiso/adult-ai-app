import { closeContext, connectBrowser, createContext } from "./browser";
import { waitForMessageCount, waitForStreamComplete } from "./browser-wait";
import { resolveEnv } from "./env";

type CliOptions = {
  model: string;
  characterSlug: string;
  message: string;
};

type PersistedMessage = {
  id?: string;
  role?: string;
  content?: string;
};

const DEFAULT_MESSAGE = "つかさ、まだオフィス残ってたのか。今日はもう誰もいないし、少しだけ休もう";
const DEFAULT_CHARACTER = "char-tsukasa";

const parseCliArgs = (argv: string[]): CliOptions => {
  let model = "";
  let characterSlug = DEFAULT_CHARACTER;
  let message = DEFAULT_MESSAGE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [key, inlineValue] = arg.split("=", 2);
    const value = inlineValue ?? argv[index + 1];

    if (key === "--model" && value) {
      model = value;
      if (!inlineValue) index += 1;
      continue;
    }
    if (key === "--character" && value) {
      characterSlug = value;
      if (!inlineValue) index += 1;
      continue;
    }
    if (key === "--message" && value) {
      message = value;
      if (!inlineValue) index += 1;
      continue;
    }
    throw new Error(`未知のオプションです: ${arg}`);
  }

  if (!model) {
    throw new Error("--model は必須です");
  }

  return { model, characterSlug, message };
};

const listPersistedMessages = async (
  devOrigin: string,
  conversationId: string,
  get: (
    url: string,
    options: { failOnStatusCode: boolean; timeout: number },
  ) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>,
): Promise<PersistedMessage[]> => {
  const response = await get(
    `${devOrigin}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      failOnStatusCode: false,
      timeout: 30_000,
    },
  );
  if (!response.ok()) {
    return [];
  }
  const payload = (await response.json()) as { messages?: PersistedMessage[] };
  return payload.messages ?? [];
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  process.env.E2E_MODEL = options.model;

  const { setupFreshConversation } = await import("./conversation-setup");

  const env = resolveEnv();
  const { browser } = await connectBrowser(env);
  const ctx = await createContext(browser);
  const page = await ctx.newPage();
  const qualityEvents: Array<{ attempt: number; passed: boolean; failedCheck: string | null }> = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (!text.includes("[quality-guard]")) return;
    const attempt = Number(text.match(/attempt=(\d+)/)?.[1] ?? "0");
    const passed = text.match(/passed=(true|false)/)?.[1] === "true";
    const failedCheck = text.match(/failed=(\S+)/)?.[1] ?? "none";
    qualityEvents.push({
      attempt,
      passed,
      failedCheck: failedCheck === "none" ? null : failedCheck,
    });
  });

  try {
    const setup = await setupFreshConversation(page, env, "S1", options.characterSlug);
    const baselineCount = await page.locator(".group\\/message").count();
    const chatResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/api/chat"),
      { timeout: 60_000 },
    );
    const titleResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(
            `/api/conversations/${encodeURIComponent(setup.conversationId)}/generate-title`,
          ),
      { timeout: 10_000 },
    );

    const input = page.locator('textarea[placeholder="メッセージを入力..."]');
    await input.fill(options.message);
    await page.locator('button[title="送信"]').click();

    const chatResponse = await chatResponsePromise;
    await waitForMessageCount(page, baselineCount + 2, 60_000);
    const streamStats = await waitForStreamComplete(page, 60_000);
    await sleep(1_500);

    const persisted = await listPersistedMessages(
      env.devOrigin,
      setup.conversationId,
      ctx.request.get.bind(ctx.request),
    );
    const toasts = await page
      .locator('[aria-label="Notifications alt+T"]')
      .textContent()
      .catch(() => "");
    const titleResponse = await titleResponsePromise
      .then((response) => response.status())
      .catch(() => null);

    const finalQualityEvent = qualityEvents.at(-1) ?? null;

    console.log(
      JSON.stringify({
        requestedModel: options.model,
        usedModel: chatResponse.headers()["x-model-used"] ?? null,
        chatStatus: chatResponse.status(),
        titleStatus: titleResponse,
        conversationId: setup.conversationId,
        renderedMessageCount: await page.locator(".group\\/message").count(),
        persistedMessageCount: persisted.length,
        qualityRetries: qualityEvents.reduce((max, event) => Math.max(max, event.attempt), 0),
        finalQualityPassed: finalQualityEvent?.passed ?? null,
        finalFailedCheck:
          finalQualityEvent && !finalQualityEvent.passed ? finalQualityEvent.failedCheck : null,
        firstTokenMs: streamStats.firstTokenMs,
        lastChunkMs: streamStats.lastChunkMs,
        hasDoneSignal: streamStats.hasDoneSignal,
        toast: toasts?.trim() ?? "",
      }),
    );
  } finally {
    await closeContext(ctx);
    await browser.close();
  }
}

void main();
