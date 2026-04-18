import { buildLocalAuthHeaders, installLocalApiAuth } from "./auth";
import { waitForDomReady } from "./browser-wait";

import type { E2eEnv } from "./env";
import type { ScenarioId } from "./types";
import type { Page } from "playwright";

export type ScenarioSetup = {
  scenarioId: ScenarioId;
  characterSlug: string;
  conversationId: string;
};

type CharacterRecord = {
  id: string;
  name: string;
};

const APP_READY_SELECTOR = 'button[aria-label="キャラクター管理"]';
const MESSAGE_GROUP_SELECTOR = ".group\\/message";
const AGE_GATE_TITLE = "年齢確認";
const AGE_GATE_ACCEPT = "はい、18歳以上です";
const NEW_CONVERSATION_NAME = "新しい会話";
const E2E_SETTINGS_STORAGE_KEY = "ai-chat-settings";
const E2E_MODEL = process.env.E2E_MODEL ?? "anthracite-org/magnum-v4-72b";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null => (typeof value === "string" ? value : null);
const parseCharacters = (value: unknown): CharacterRecord[] => {
  if (!isRecord(value) || !Array.isArray(value.characters)) {
    return [];
  }

  return value.characters.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = readString(entry.id);
    const name = readString(entry.name);
    return id && name ? [{ id, name }] : [];
  });
};

const parseConversationId = (value: unknown): string | null => {
  if (!isRecord(value) || !isRecord(value.conversation)) {
    return null;
  }
  return readString(value.conversation.id);
};

const normalizeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "");

const isDefaultCharacterSlug = (characterSlug: string): boolean => {
  const normalized = normalizeToken(characterSlug);
  return (
    normalized === "" || normalized === "default" || normalized === "ai" || normalized === "sakura"
  );
};

const matchCharacter = (
  characters: CharacterRecord[],
  characterSlug: string,
): CharacterRecord | null => {
  const normalizedSlug = normalizeToken(characterSlug);
  for (const character of characters) {
    const candidates = [
      character.id,
      character.name,
      character.name.replace(/\s+/g, ""),
      character.name.replace(/\s+/g, "-"),
    ];
    if (candidates.some((candidate) => normalizeToken(candidate) === normalizedSlug)) {
      return character;
    }
  }
  return null;
};

const fetchCharacters = async (
  page: Page,
  env: E2eEnv,
  userEmail: string,
): Promise<CharacterRecord[]> => {
  const response = await page.context().request.get(`${env.devOrigin}/api/characters`, {
    failOnStatusCode: false,
    headers: buildLocalAuthHeaders(userEmail),
    timeout: 30_000,
  });
  if (!response.ok()) {
    throw new Error(`character list fetch failed: ${response.status()}`);
  }
  const payload: unknown = await response.json();
  return parseCharacters(payload);
};

const readRenderedMessages = async (
  page: Page,
): Promise<Array<{ role: "user" | "assistant"; text: string }>> =>
  Promise.all(
    Array.from({ length: await page.locator(MESSAGE_GROUP_SELECTOR).count() }, async (_, index) => {
      const group = page.locator(MESSAGE_GROUP_SELECTOR).nth(index);
      const className = (await group.getAttribute("class")) ?? "";
      const text = (await group.textContent())?.trim() ?? "";
      const role = className.includes("flex-row-reverse") ? "user" : "assistant";
      return { role, text };
    }),
  );

const waitForFreshConversationState = async (page: Page): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= 30_000) {
    const messages = await readRenderedMessages(page);
    if (messages.length === 0) {
      return;
    }
    if (messages.length === 1 && messages[0]?.role === "assistant") {
      // 仕様上、作成直後の自動グリーティング 1 件までは許容する。
      return;
    }
    await sleep(100);
  }
  throw new Error("fresh conversation did not settle to 0 or 1 greeting message");
};

const dismissAgeGateIfPresent = async (page: Page): Promise<void> => {
  const ageGate = page.getByRole("dialog", { name: AGE_GATE_TITLE });
  const isVisible = await ageGate.isVisible().catch(() => false);
  if (!isVisible) {
    return;
  }

  await page.getByRole("button", { name: AGE_GATE_ACCEPT, exact: true }).click();
  await ageGate.waitFor({ state: "hidden", timeout: 10_000 });
};

const seedE2eSettings = async (page: Page, activeCharacterId: string | null): Promise<void> => {
  const persisted = JSON.stringify({
    state: {
      model: E2E_MODEL,
      nsfwBlur: false,
      darkMode: true,
      autoGenerateImages: false,
      ttsEnabled: false,
      ttsVoiceUri: "",
      ttsRate: 1,
      ttsPitch: 1,
      activeCharacterId,
    },
    version: 22,
  });

  await page.addInitScript(
    ({ key, value }) => {
      (
        globalThis as {
          localStorage: {
            setItem: (storageKey: string, storageValue: string) => void;
          };
        }
      ).localStorage.setItem(key, value);
    },
    { key: E2E_SETTINGS_STORAGE_KEY, value: persisted },
  );
};

const getNewConversationButton = (page: Page) =>
  page.getByRole("button", { name: NEW_CONVERSATION_NAME, exact: true }).first();

export async function setupFreshConversation(
  page: Page,
  env: E2eEnv,
  scenarioId: ScenarioId,
  characterSlug: string,
  userEmail: string,
): Promise<ScenarioSetup> {
  await installLocalApiAuth(page, env.devOrigin, userEmail);

  const characters = await fetchCharacters(page, env, userEmail);
  const matchedCharacter = isDefaultCharacterSlug(characterSlug)
    ? null
    : matchCharacter(characters, characterSlug);
  if (!isDefaultCharacterSlug(characterSlug) && !matchedCharacter) {
    throw new Error(`character not found for slug: ${characterSlug}`);
  }

  // localhost でも最初の API リクエストから namespaced userEmail を渡して
  // D1 の conversation/message を run 単位で分離する。
  await seedE2eSettings(page, matchedCharacter?.id ?? null);
  await page.goto(`${env.devOrigin}/`, { waitUntil: "domcontentloaded" });
  await dismissAgeGateIfPresent(page);
  await waitForDomReady(page, APP_READY_SELECTOR);
  await getNewConversationButton(page).waitFor({ state: "visible", timeout: 30_000 });

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/conversations") &&
      response.status() >= 200 &&
      response.status() < 300,
    { timeout: 30_000 },
  );

  try {
    await getNewConversationButton(page).click();
    const createResponse = await createResponsePromise;
    const payload: unknown = await createResponse.json();
    const conversationId = parseConversationId(payload);

    if (!conversationId) {
      throw new Error("conversation id missing from create conversation response");
    }

    await waitForFreshConversationState(page);

    return {
      scenarioId,
      characterSlug,
      conversationId,
    };
  } catch (error) {
    await createResponsePromise.catch(() => undefined);
    throw error;
  }
}
