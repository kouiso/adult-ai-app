import { execFile } from "node:child_process";

import type { JudgeVerdict } from "../types";

const CONVERSATION_ID_PATTERN = /^[\dA-Za-z-]+$/;
const MESSAGE_CONVERSATION_COLUMN = "conversation_id";

type ExecFileResult = {
  stdout: string;
  stderr: string;
};

type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

const execFileAsync = (file: string, args: readonly string[]): Promise<ExecFileResult> =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(`wrangler d1 execute failed: ${error.message}${stderr ? `; ${stderr}` : ""}`),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }
  if (typeof value === "object") {
    return Object.values(value).every((entry) => isJsonValue(entry));
  }
  return false;
};

const isCountRow = (value: JsonValue): value is { c: number | string } =>
  isJsonObject(value) && (typeof value.c === "number" || typeof value.c === "string");

const extractCount = (value: JsonValue): number | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const extracted = extractCount(entry);
      if (extracted !== null) return extracted;
    }
    return null;
  }

  if (!isJsonObject(value)) return null;

  if (Array.isArray(value.results)) {
    for (const row of value.results) {
      if (isCountRow(row)) {
        const count = Number(row.c);
        if (Number.isFinite(count)) return count;
      }
    }
  }

  for (const nested of Object.values(value)) {
    const extracted = extractCount(nested);
    if (extracted !== null) return extracted;
  }

  return null;
};

export async function fetchPersistedCount(conversationId: string): Promise<number> {
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) {
    throw new Error(`invalid conversationId: ${conversationId}`);
  }

  const command = `SELECT COUNT(*) as c FROM message WHERE ${MESSAGE_CONVERSATION_COLUMN} = '${conversationId}'`;
  const { stdout, stderr } = await execFileAsync("wrangler", [
    "d1",
    "execute",
    "adult-ai-db",
    "--local",
    "--json",
    "--command",
    command,
  ]);

  if (!stdout.trim()) {
    throw new Error(`wrangler d1 execute returned empty stdout${stderr ? `; ${stderr}` : ""}`);
  }

  const parsedUnknown: unknown = JSON.parse(stdout);
  if (!isJsonValue(parsedUnknown)) {
    throw new Error(`wrangler output is not valid JSON value: ${stdout}`);
  }

  const parsed = parsedUnknown;
  const count = extractCount(parsed);
  if (count === null) {
    throw new Error(`could not extract count from wrangler output: ${stdout}`);
  }

  return count;
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function waitForD1Durability(args: {
  userEmail: string;
  conversationId: string;
  expectedCount: number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ settled: boolean; lastCount: number; elapsedMs: number }> {
  const { userEmail, conversationId, expectedCount, timeoutMs = 2_000, intervalMs = 100 } = args;
  void userEmail;

  const startedAt = Date.now();
  let lastCount = -1;

  while (true) {
    lastCount = await fetchPersistedCount(conversationId);
    const elapsedMs = Date.now() - startedAt;

    if (lastCount >= expectedCount) {
      return {
        settled: true,
        lastCount,
        elapsedMs,
      };
    }

    if (elapsedMs >= timeoutMs) {
      return {
        settled: false,
        lastCount,
        elapsedMs,
      };
    }

    await sleep(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
}

export async function runD1PersistenceJudge(input: {
  conversationId: string;
  renderedMessageCount: number;
  greetingMessageCount?: number;
  imageMessageCount?: number;
  persistedCount?: number;
  uiReason?: string | null;
}): Promise<JudgeVerdict> {
  const persistedCount = input.persistedCount ?? (await fetchPersistedCount(input.conversationId));
  const greetingMessageCount = input.greetingMessageCount ?? 0;
  const imageMessageCount = input.imageMessageCount ?? 0;
  const renderedWithoutGreeting = Math.max(0, input.renderedMessageCount - greetingMessageCount);
  const baseExpectedPersistedCount = renderedWithoutGreeting + imageMessageCount;
  const adjustedForMissingDoneSignal = input.uiReason === "stream done signal missing";
  const expectedPersistedCount = Math.max(
    0,
    baseExpectedPersistedCount - (adjustedForMissingDoneSignal ? 1 : 0),
  );

  if (persistedCount !== expectedPersistedCount) {
    return {
      pass: false,
      reason:
        `persistedCount ${persistedCount} != expectedPersistedCount ${expectedPersistedCount} ` +
        `(renderedWithoutGreeting ${renderedWithoutGreeting} + imageMessageCount ${imageMessageCount}` +
        (adjustedForMissingDoneSignal ? " - 1 missing stream-done persist allowance)" : ")"),
    };
  }

  return {
    pass: true,
    reason:
      `persistedCount ${persistedCount} matches expectedPersistedCount ${expectedPersistedCount} ` +
      `(renderedWithoutGreeting ${renderedWithoutGreeting} + imageMessageCount ${imageMessageCount}` +
      (adjustedForMissingDoneSignal ? " - 1 missing stream-done persist allowance)" : ")"),
  };
}
