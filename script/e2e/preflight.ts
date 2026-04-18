import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import type { E2eEnv } from "./env";
import { classifyFailure } from "./failure-taxonomy";
import { atomicWriteJson, getPaths } from "./manifest";
import type { PreflightCheckResult, PreflightReport } from "./types";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const D1_DB_NAME = "adult-ai-db";
const CDP_TIMEOUT_MS = 2_000;
const FETCH_TIMEOUT_MS = 3_000;
const WRANGLER_TIMEOUT_MS = 15_000;
const SQLITE_BUSY_RETRY_MS = 1_000;
const SQLITE_BUSY_RETRIES = 3;

const execErrorSchema = z.object({
  message: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

const countValueSchema = z.union([z.number(), z.string()]);
const rowSchema = z.record(z.string(), countValueSchema);
const wranglerJsonSchema = z.union([
  z.object({
    results: z.array(rowSchema).optional(),
    success: z.boolean().optional(),
    error: z.string().optional(),
  }),
  z.array(
    z.object({
      results: z.array(rowSchema).optional(),
      success: z.boolean().optional(),
      error: z.string().optional(),
    }),
  ),
]);

type CheckStatus = PreflightCheckResult["status"];
type CheckOutcome = {
  status: CheckStatus;
  detail: string;
};

type SchemaColumns = {
  userEmail: string;
  conversationUserId: string;
  messageConversationId: string;
  usageLogCreatedAt: string;
};

const formatError = (error: unknown): string => {
  const parsed = execErrorSchema.safeParse(error);
  const message =
    parsed.success && parsed.data.message
      ? parsed.data.message
      : error instanceof Error
        ? error.message
        : String(error);
  const stderr =
    parsed.success && parsed.data.stderr ? parsed.data.stderr.trim() : "";
  const stdout =
    parsed.success && parsed.data.stdout ? parsed.data.stdout.trim() : "";
  const category = classifyFailure({ message, context: "preflight" });
  const fragments = [`[${category}] ${message}`];
  if (stderr.length > 0) fragments.push(`stderr=${stderr}`);
  if (stdout.length > 0) fragments.push(`stdout=${stdout}`);
  return fragments.join(" | ");
};

const runCheck = async (
  name: string,
  fn: () => Promise<CheckOutcome>,
): Promise<PreflightCheckResult> => {
  const startedAt = Date.now();
  try {
    const outcome = await fn();
    return {
      name,
      status: outcome.status,
      detail: outcome.detail,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name,
      status: "fail",
      detail: formatError(error),
      elapsedMs: Date.now() - startedAt,
    };
  }
};

const execCommand = async (
  file: string,
  args: string[],
  timeoutMs = WRANGLER_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> => {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return { stdout, stderr };
};

const fetchWithTimeout = async (
  input: string,
  timeoutMs: number,
): Promise<Response> =>
  fetch(input, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });

const connectToPort = async (port: number, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });

    const cleanup = (): void => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      cleanup();
      resolve();
    });
    socket.once("timeout", () => {
      cleanup();
      reject(new Error(`TCP connect timeout (${timeoutMs}ms)`));
    });
    socket.once("error", (error) => {
      cleanup();
      reject(error);
    });
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readFileIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
};

const extractColumnName = (
  source: string,
  pattern: RegExp,
  label: string,
): string => {
  const match = source.match(pattern);
  const value = match?.[1]?.trim();
  if (!value) {
    throw new Error(`schema から ${label} 列を特定できませんでした`);
  }
  return value;
};

const loadSchemaColumns = async (): Promise<SchemaColumns> => {
  const [userSchema, conversationSchema, messageSchema, usageLogSchema] =
    await Promise.all([
      fs.readFile(path.join(PROJECT_ROOT, "src/schema/user.ts"), "utf8"),
      fs.readFile(path.join(PROJECT_ROOT, "src/schema/conversation.ts"), "utf8"),
      fs.readFile(path.join(PROJECT_ROOT, "src/schema/message.ts"), "utf8"),
      fs.readFile(path.join(PROJECT_ROOT, "src/schema/usage-log.ts"), "utf8"),
    ]);

  return {
    userEmail: extractColumnName(userSchema, /email:\s*text\("([^"]+)"/, "user.email"),
    conversationUserId: extractColumnName(
      conversationSchema,
      /userId:\s*text\("([^"]+)"/,
      "conversation.user_id",
    ),
    messageConversationId: extractColumnName(
      messageSchema,
      /conversationId:\s*text\("([^"]+)"/,
      "message.conversation_id",
    ),
    usageLogCreatedAt: extractColumnName(
      usageLogSchema,
      /createdAt:\s*integer\("([^"]+)"/,
      "usage_log.created_at",
    ),
  };
};

const stripWrappingQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const parseEnvValue = (fileContent: string, key: string): string | null => {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m");
  const match = fileContent.match(pattern);
  if (!match?.[1]) {
    return null;
  }
  const value = stripWrappingQuotes(match[1]);
  return value.length > 0 ? value : null;
};

const runWranglerD1 = async (sql: string): Promise<{ stdout: string; stderr: string }> =>
  execCommand("pnpm", [
    "exec",
    "wrangler",
    "d1",
    "execute",
    D1_DB_NAME,
    "--local",
    "--json",
    "--command",
    sql,
  ]);

const extractCountFromJson = (stdout: string): number | null => {
  try {
    const raw = JSON.parse(stdout) as unknown;
    const parsed = wranglerJsonSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }

    const entries = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    for (const entry of entries) {
      const row = entry.results?.[0];
      if (!row) continue;
      for (const value of Object.values(row)) {
        const normalized = countValueSchema.parse(value);
        const count =
          typeof normalized === "number"
            ? normalized
            : Number.parseInt(normalized, 10);
        if (Number.isFinite(count)) {
          return count;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
};

const extractCountFromText = (stdout: string): number | null => {
  const directCount =
    stdout.match(/"count"\s*:\s*(\d+)/i) ??
    stdout.match(/\bcount\b[^\d]*(\d+)/i) ??
    stdout.match(/\bCOUNT\(\*\)\b[^\d]*(\d+)/i) ??
    stdout.match(/\b(\d+)\b/);
  if (!directCount?.[1]) {
    return null;
  }
  const value = Number.parseInt(directCount[1], 10);
  return Number.isFinite(value) ? value : null;
};

const extractCount = (stdout: string): number | null =>
  extractCountFromJson(stdout) ?? extractCountFromText(stdout);

const resolveChromeVersion = async (): Promise<string> => {
  const candidates: Array<{ file: string; args: string[] }> = [
    { file: "google-chrome", args: ["--version"] },
    { file: "google-chrome-stable", args: ["--version"] },
    { file: "chromium", args: ["--version"] },
    { file: "chromium-browser", args: ["--version"] },
  ];

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const { stdout, stderr } = await execCommand(candidate.file, candidate.args, 5_000);
      const output = `${stdout}\n${stderr}`.trim();
      if (output.length > 0) {
        return output.split("\n")[0]?.trim() ?? output;
      }
    } catch (error) {
      errors.push(`${candidate.file}: ${formatError(error)}`);
    }
  }

  const macAppCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const file of macAppCandidates) {
    try {
      const { stdout, stderr } = await execCommand(file, ["--version"], 5_000);
      const output = `${stdout}\n${stderr}`.trim();
      if (output.length > 0) {
        return output.split("\n")[0]?.trim() ?? output;
      }
    } catch (error) {
      errors.push(`${file}: ${formatError(error)}`);
    }
  }

  return `unresolved (playwright launch fallback)`;
};

const checkCdpPortOpen = async (env: E2eEnv): Promise<CheckOutcome> => {
  try {
    await connectToPort(env.cdpPort, CDP_TIMEOUT_MS);
    return {
      status: "pass",
      detail: `127.0.0.1:${env.cdpPort} に接続できました`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "skip",
      detail: `127.0.0.1:${env.cdpPort} に接続できないため Playwright local launch にフォールバックします: ${message}`,
    };
  }
};

const checkDevOrigin = async (env: E2eEnv): Promise<CheckOutcome> => {
  const response = await fetchWithTimeout(env.devOrigin, FETCH_TIMEOUT_MS);
  if (response.status >= 200 && response.status <= 399) {
    return {
      status: "pass",
      detail: `${env.devOrigin} -> HTTP ${response.status}`,
    };
  }
  throw new Error(`${env.devOrigin} -> HTTP ${response.status}`);
};

const checkWorkerOrigin = async (env: E2eEnv): Promise<CheckOutcome> => {
  const healthUrl = new URL("/api/health", env.workerOrigin).toString();
  const healthResponse = await fetchWithTimeout(healthUrl, FETCH_TIMEOUT_MS);
  if (healthResponse.status === 200) {
    return {
      status: "pass",
      detail: `${healthUrl} -> HTTP 200`,
    };
  }

  if (healthResponse.status !== 404 && healthResponse.status !== 405) {
    throw new Error(`${healthUrl} -> HTTP ${healthResponse.status}`);
  }

  const rootUrl = new URL("/", env.workerOrigin).toString();
  const rootResponse = await fetchWithTimeout(rootUrl, FETCH_TIMEOUT_MS);
  if (rootResponse.status < 500) {
    return {
      status: "pass",
      detail: `${healthUrl} は未実装のため ${rootUrl} にフォールバック -> HTTP ${rootResponse.status}`,
    };
  }
  throw new Error(`${rootUrl} -> HTTP ${rootResponse.status}`);
};

const checkSecrets = async (): Promise<CheckOutcome> => {
  const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");
  const devVars = await readFileIfExists(devVarsPath);

  const keys = ["OPENROUTER_API_KEY", "NOVITA_API_KEY"] as const;
  const values = new Map<string, string | null>();

  if (devVars !== null) {
    for (const key of keys) {
      values.set(key, parseEnvValue(devVars, key));
    }
    const missing = keys.filter((key) => !values.get(key));
    if (missing.length === 0) {
      return {
        status: "pass",
        detail: `.dev.vars に ${keys.join(", ")} が揃っています`,
      };
    }
    throw new Error(`.dev.vars に不足キーがあります: ${missing.join(", ")}`);
  }

  for (const key of keys) {
    const value = process.env[key];
    values.set(key, typeof value === "string" && value.trim().length > 0 ? value : null);
  }
  const missing = keys.filter((key) => !values.get(key));
  if (missing.length > 0) {
    throw new Error(`process.env に不足キーがあります: ${missing.join(", ")}`);
  }

  return {
    status: "pass",
    detail: `.dev.vars 不在のため process.env で ${keys.join(", ")} を確認しました`,
  };
};

const checkD1Reset = async (): Promise<CheckOutcome> => {
  const columns = await loadSchemaColumns();
  const e2eNamespacePattern = "e2e-%@adult-ai-app.local";
  const sql = [
    "DELETE FROM message",
    `WHERE ${columns.messageConversationId} IN (`,
    "  SELECT conversation.id",
    "  FROM conversation",
    "  INNER JOIN user ON user.id = conversation." + columns.conversationUserId,
    `  WHERE user.${columns.userEmail} LIKE '${e2eNamespacePattern}'`,
    ");",
    "DELETE FROM conversation",
    `WHERE ${columns.conversationUserId} IN (`,
    `  SELECT id FROM user WHERE ${columns.userEmail} LIKE '${e2eNamespacePattern}'`,
    ");",
  ].join("\n");

  for (let attempt = 1; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
    try {
      const { stdout, stderr } = await runWranglerD1(sql);
      const detail = stderr.trim().length > 0 ? `${stdout.trim()} | ${stderr.trim()}` : stdout.trim();
      return {
        status: "pass",
        detail:
          detail.length > 0
            ? detail
            : `${e2eNamespacePattern} ユーザーに紐づく conversation/message を削除しました`,
      };
    } catch (error) {
      const message = formatError(error);
      if (message.includes("SQLITE_BUSY")) {
        if (attempt === SQLITE_BUSY_RETRIES) {
          return {
            status: "skip",
            detail: "e2e namespace reset は SQLITE_BUSY のためスキップしました",
          };
        }
        await sleep(SQLITE_BUSY_RETRY_MS * attempt);
        continue;
      }
      if (message.includes("SQLITE_READONLY")) {
        return {
          status: "skip",
          detail: "e2e namespace reset は SQLITE_READONLY のためスキップしました",
        };
      }
      throw error;
    }
  }

  return {
    status: "skip",
    detail: "e2e namespace reset は実行されませんでした",
  };
};

const checkUsageLogDailyBudget = async (): Promise<CheckOutcome> => {
  const columns = await loadSchemaColumns();
  // D1 の created_at は epoch milliseconds なので unixepoch 変換が必要です。
  const sql = [
    "SELECT COUNT(*) AS count",
    "FROM usage_log",
    `WHERE DATE(${columns.usageLogCreatedAt} / 1000, 'unixepoch') = DATE('now');`,
  ].join("\n");

  for (let attempt = 1; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
    try {
      const { stdout } = await runWranglerD1(sql);
      const count = extractCount(stdout);
      if (count === null) {
        throw new Error(`COUNT(*) を抽出できませんでした: ${stdout.trim()}`);
      }
      if (count < 400) {
        return {
          status: "pass",
          detail: `usage_log 当日件数 ${count}/400 未満`,
        };
      }
      throw new Error(`usage_log 当日件数 ${count} が上限 400 に達しています`);
    } catch (error) {
      const message = formatError(error);
      if (message.toLowerCase().includes("no such table: usage_log")) {
        return {
          status: "skip",
          detail: "usage_log テーブル未作成のためスキップしました",
        };
      }
      if (message.includes("SQLITE_BUSY")) {
        if (attempt === SQLITE_BUSY_RETRIES) {
          return {
            status: "skip",
            detail: "usage_log 集計は SQLITE_BUSY のためスキップしました",
          };
        }
        await sleep(SQLITE_BUSY_RETRY_MS * attempt);
        continue;
      }
      throw error;
    }
  }

  return {
    status: "skip",
    detail: "usage_log 集計は実行されませんでした",
  };
};

const checkVersionPin = async (configuredModel: string): Promise<CheckOutcome> => {
  const [nodeVersion, playwrightVersion, chromeVersion] = await Promise.all([
    execCommand("node", ["--version"], 5_000),
    execCommand("pnpm", ["exec", "playwright", "--version"], 10_000),
    resolveChromeVersion().then((value) => ({ stdout: value, stderr: "" })),
  ]);

  return {
    status: "pass",
    detail: [
      `model=${configuredModel}`,
      `node=${nodeVersion.stdout.trim()}`,
      `playwright=${playwrightVersion.stdout.trim()}`,
      `chrome=${chromeVersion.stdout.trim()}`,
    ].join("; "),
  };
};

export async function runPreflight(
  env: E2eEnv,
  configuredModel: string,
): Promise<PreflightReport> {
  const startedAt = new Date().toISOString();
  const checks = await Promise.all([
    runCheck("cdp.port_open", async () => checkCdpPortOpen(env)),
    runCheck("dev_server.dev_origin", async () => checkDevOrigin(env)),
    runCheck("dev_server.worker_origin", async () => checkWorkerOrigin(env)),
    runCheck("secrets.openrouter_novita", checkSecrets),
    runCheck("d1.reset_e2e_namespace", checkD1Reset),
    runCheck("usage_log.daily_budget", checkUsageLogDailyBudget),
    runCheck("version.pin", async () => checkVersionPin(configuredModel)),
  ]);
  const report: PreflightReport = {
    runId: env.runId,
    startedAt,
    completedAt: new Date().toISOString(),
    allPassed: checks.every((check) => check.status !== "fail"),
    checks,
  };

  const { preflightPath } = getPaths(env.resultsRoot, env.runId);
  await atomicWriteJson(preflightPath, report);
  return report;
}

export async function enforcePreflight(
  env: E2eEnv,
  configuredModel: string,
): Promise<PreflightReport> {
  const report = await runPreflight(env, configuredModel);
  if (report.allPassed) {
    return report;
  }

  const failures = report.checks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.name}: ${check.detail}`);
  throw new Error(`Preflight failed\n${failures.join("\n")}`);
}
