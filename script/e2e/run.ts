import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { connectBrowser, heartbeat, staggeredDelay } from "./browser";
import { resolveEnv, type E2eEnv } from "./env";
import { scoreScenario } from "./judges/rubric";
import { createInitialManifest, getPaths, upsertScenario, writeManifest } from "./manifest";
import { enforcePreflight } from "./preflight";
import { writeSummary } from "./reporter";
import { runScenario } from "./scenario-runner";
import scenarioS1 from "./scenarios/s1-midnight-meeting";
import scenarioS2 from "./scenarios/s2-cohabitation-24h";
import scenarioS3 from "./scenarios/s3-multi-round";
import scenarioS4 from "./scenarios/s4-character-switch";
import scenarioS5 from "./scenarios/s5-monkey-kink";
import { SCENARIO_IDS } from "./types";

import type { ScenarioDefinition } from "./scenarios/_types";
import type { RunManifest, RunStatus, ScenarioId, ScenarioResult } from "./types";
import type { Browser } from "playwright";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const STORE_SETTINGS_PATH = path.join(PROJECT_ROOT, "src/store/settings-store.ts");
const MODEL_LIBRARY_PATH = path.join(PROJECT_ROOT, "src/lib/model.ts");
const API_ROUTE_PATH = path.join(PROJECT_ROOT, "functions/api/[[route]].ts");

const HARDCODED_MODEL_FALLBACK = "openrouter/claude-sonnet-4";
const SMOKE_TURN_LIMIT = 5;
const WAVE_ONE_STEP_SECONDS = 3;
const WAVE_TWO_STEP_SECONDS = 4;
const VERSION_FALLBACK = "unknown";

const USAGE = `Usage:
  tsx script/e2e/run.ts                           # full run, all 5 scenarios, both waves
  tsx script/e2e/run.ts --scenarios=S1,S2         # comma-separated
  tsx script/e2e/run.ts --wave=1                  # wave 1 only (S1,S2,S3)
  tsx script/e2e/run.ts --wave=2                  # wave 2 only (S4,S5)
  tsx script/e2e/run.ts --smoke                   # only S1, first 5 turns
  tsx script/e2e/run.ts --smoke --scenarios=S2    # smoke a different scenario
  tsx script/e2e/run.ts --runId=abc               # resume / override runId`;

const SCENARIO_MAP = {
  S1: scenarioS1,
  S2: scenarioS2,
  S3: scenarioS3,
  S4: scenarioS4,
  S5: scenarioS5,
} satisfies Record<ScenarioId, ScenarioDefinition>;

const WAVE_ONE_SCENARIOS = ["S1", "S2", "S3"] as const;
const WAVE_TWO_SCENARIOS = ["S4", "S5"] as const;
const WAVE_ONE_SET = new Set<ScenarioId>(WAVE_ONE_SCENARIOS);
const WAVE_TWO_SET = new Set<ScenarioId>(WAVE_TWO_SCENARIOS);

type WaveNumber = 1 | 2;

type CliOptions = {
  smoke: boolean;
  scenarios: ScenarioId[] | null;
  wave: WaveNumber | null;
  runId: string | null;
  help: boolean;
};

type ConfiguredModelResolution = {
  value: string;
  source: string;
};

type RunPlan = {
  env: E2eEnv;
  configuredModel: ConfiguredModelResolution;
  scenarios: ScenarioDefinition[];
  waves: Array<{
    wave: WaveNumber;
    scenarios: ScenarioDefinition[];
    staggerSeconds: number;
  }>;
};

type RunContext = {
  env: E2eEnv;
  manifest: RunManifest;
  manifestPath: string;
};

type VersionInfo = {
  node: string;
  playwright: string;
  chrome: string;
};

const isScenarioId = (value: string): value is ScenarioId =>
  SCENARIO_IDS.some((scenarioId) => scenarioId === value);

const isWaveOneScenario = (scenarioId: ScenarioId): boolean => WAVE_ONE_SET.has(scenarioId);

const isWaveTwoScenario = (scenarioId: ScenarioId): boolean => WAVE_TWO_SET.has(scenarioId);

const parseScenarioList = (value: string): ScenarioId[] => {
  const tokens = value
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    throw new Error("--scenarios は 1 件以上の scenarioId を指定してください");
  }

  const unique: ScenarioId[] = [];
  for (const token of tokens) {
    if (!isScenarioId(token)) {
      throw new Error(`未知の scenarioId です: ${token}`);
    }
    if (!unique.includes(token)) {
      unique.push(token);
    }
  }

  return unique;
};

const parseWave = (value: string): WaveNumber => {
  if (value === "1") return 1;
  if (value === "2") return 2;
  throw new Error(`--wave は 1 または 2 のみ指定できます: ${value}`);
};

const readOptionValue = (
  arg: string,
  args: string[],
  index: number,
): { value: string; consumedNext: boolean } => {
  const equalsIndex = arg.indexOf("=");
  if (equalsIndex >= 0) {
    const value = arg.slice(equalsIndex + 1).trim();
    if (value.length === 0) {
      throw new Error(`${arg.slice(0, equalsIndex)} に値が必要です`);
    }
    return { value, consumedNext: false };
  }

  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`${arg} に値が必要です`);
  }
  return { value: next.trim(), consumedNext: true };
};

export const parseCliArgs = (argv: string[]): CliOptions => {
  let smoke = false;
  let scenarios: ScenarioId[] | null = null;
  let wave: WaveNumber | null = null;
  let runId: string | null = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--smoke") {
      smoke = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg.startsWith("--scenarios")) {
      const parsed = readOptionValue(arg, argv, index);
      scenarios = parseScenarioList(parsed.value);
      if (parsed.consumedNext) index += 1;
      continue;
    }
    if (arg.startsWith("--wave")) {
      const parsed = readOptionValue(arg, argv, index);
      wave = parseWave(parsed.value);
      if (parsed.consumedNext) index += 1;
      continue;
    }
    if (arg.startsWith("--runId")) {
      const parsed = readOptionValue(arg, argv, index);
      runId = parsed.value;
      if (parsed.consumedNext) index += 1;
      continue;
    }

    throw new Error(`未知のオプションです: ${arg}`);
  }

  return {
    smoke,
    scenarios,
    wave,
    runId,
    help,
  };
};

const filterByWave = (
  scenarioIds: readonly ScenarioId[],
  wave: WaveNumber | null,
): ScenarioId[] => {
  if (wave === null) {
    return [...scenarioIds];
  }
  return scenarioIds.filter((scenarioId) =>
    wave === 1 ? isWaveOneScenario(scenarioId) : isWaveTwoScenario(scenarioId),
  );
};

const buildScenarioSelection = (cli: CliOptions): ScenarioDefinition[] => {
  const requestedScenarioIds =
    cli.scenarios ?? (cli.smoke ? (["S1"] satisfies ScenarioId[]) : [...SCENARIO_IDS]);
  const filteredScenarioIds = filterByWave(requestedScenarioIds, cli.wave);

  if (filteredScenarioIds.length === 0) {
    throw new Error("指定された --wave と --scenarios の組み合わせでは実行対象が 0 件です");
  }

  if (cli.smoke) {
    if (cli.wave !== null) {
      throw new Error("--smoke と --wave は同時に指定できません");
    }
    if (filteredScenarioIds.length > 1) {
      throw new Error("--smoke は 1 シナリオのみ実行できます");
    }
    const smokeId = filteredScenarioIds[0] ?? "S1";
    return [
      {
        ...SCENARIO_MAP[smokeId],
        turns: SCENARIO_MAP[smokeId].turns.slice(0, SMOKE_TURN_LIMIT),
      },
    ];
  }

  return filteredScenarioIds.map((scenarioId) => SCENARIO_MAP[scenarioId]);
};

const buildWaves = (scenarios: ScenarioDefinition[]): RunPlan["waves"] => {
  const waveOne = scenarios.filter((scenario) => isWaveOneScenario(scenario.scenarioId));
  const waveTwo = scenarios.filter((scenario) => isWaveTwoScenario(scenario.scenarioId));

  const waves: RunPlan["waves"] = [];
  if (waveOne.length > 0) {
    waves.push({
      wave: 1,
      scenarios: waveOne,
      staggerSeconds: WAVE_ONE_STEP_SECONDS,
    });
  }
  if (waveTwo.length > 0) {
    waves.push({
      wave: 2,
      scenarios: waveTwo,
      staggerSeconds: WAVE_TWO_STEP_SECONDS,
    });
  }
  return waves;
};

const fileExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const parseConfiguredModelFromSource = (source: string, pattern: RegExp): string | null => {
  const match = source.match(pattern);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
};

export const resolveConfiguredModel = async (): Promise<ConfiguredModelResolution> => {
  const modelLibrarySource = await readFile(MODEL_LIBRARY_PATH, "utf8").catch(() => null);
  if (modelLibrarySource !== null) {
    const model = parseConfiguredModelFromSource(
      modelLibrarySource,
      /export const DEFAULT_CHAT_MODEL = "([^"]+)"/,
    );
    if (model !== null) {
      return {
        value: model,
        source: "src/lib/model.ts DEFAULT_CHAT_MODEL",
      };
    }
  }

  const storeSource = await readFile(STORE_SETTINGS_PATH, "utf8").catch(() => null);
  if (storeSource !== null) {
    const model = parseConfiguredModelFromSource(
      storeSource,
      /const DEFAULT_MODEL = DEFAULT_CHAT_MODEL/,
    );
    if (model !== null) {
      return {
        value: model,
        source: "src/store/settings-store.ts DEFAULT_MODEL",
      };
    }
  }

  const apiSource = await readFile(API_ROUTE_PATH, "utf8").catch(() => null);
  if (apiSource !== null) {
    const model = parseConfiguredModelFromSource(
      apiSource,
      /const chatSchema =[\S\s]*?\bmodel:\s*z\.enum\(ALLOWED_MODELS\)\.optional\(\)\.default\(([^)]+)\)/,
    );
    if (model !== null) {
      return {
        value: model,
        source: "functions/api/[[route]].ts chatSchema default",
      };
    }
  }

  return {
    value: HARDCODED_MODEL_FALLBACK,
    source: "HARDCODED_MODEL_FALLBACK",
  };
};

const extractVersionInfo = (detail: string): VersionInfo => {
  const pairs = detail
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const result: VersionInfo = {
    node: VERSION_FALLBACK,
    playwright: VERSION_FALLBACK,
    chrome: VERSION_FALLBACK,
  };

  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key === "node" || key === "playwright" || key === "chrome") {
      result[key] = value;
    }
  }

  return result;
};

const resolveRunStatus = (scenarios: ScenarioResult[]): RunStatus =>
  scenarios.every((scenario) => scenario.status === "completed") ? "completed" : "aborted";

const resolveTerminationReason = (scenarios: ScenarioResult[]): string | null => {
  const failures = scenarios.filter((scenario) => scenario.status !== "completed");
  if (failures.length === 0) {
    return null;
  }
  return failures
    .map((scenario) => `${scenario.scenarioId}:${scenario.terminationReason ?? scenario.status}`)
    .join(", ");
};

const toUnexpectedScenarioResult = (def: ScenarioDefinition, error: unknown): ScenarioResult => {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();
  return {
    scenarioId: def.scenarioId,
    conversationId: "pending",
    characterSlug: def.characterSlug,
    startedAt: now,
    completedAt: now,
    status: "setup_failure",
    terminationReason: `orchestrator_unhandled: ${message}`,
    turns: [],
    imageResults: [],
    rubric: null,
    provisional: true,
    failureCategory: "test.setup_failure",
  };
};

const closeLingeringContexts = async (browser: Browser): Promise<void> => {
  const contexts = browser.contexts();
  await Promise.allSettled(
    contexts.map(async (context) => {
      await context.close();
    }),
  );
};

const runWave = async (
  browser: Browser,
  env: E2eEnv,
  runDir: string,
  wave: RunPlan["waves"][number],
): Promise<ScenarioResult[]> => {
  console.error(
    `[run] wave=${wave.wave} scenarios=${wave.scenarios.map((scenario) => scenario.scenarioId).join(",")} stagger=${wave.staggerSeconds}s`,
  );

  const settled = await Promise.allSettled(
    wave.scenarios.map(async (scenario, index) => {
      await staggeredDelay(index, wave.staggerSeconds);
      return runScenario(browser, env, scenario, runDir);
    }),
  );

  const results: ScenarioResult[] = [];
  for (const [index, item] of settled.entries()) {
    if (item.status === "fulfilled") {
      results.push(item.value);
      continue;
    }
    results.push(toUnexpectedScenarioResult(wave.scenarios[index], item.reason));
  }

  await closeLingeringContexts(browser);
  return results;
};

const scoreManifest = (manifest: RunManifest): RunManifest => ({
  ...manifest,
  scenarios: manifest.scenarios
    .map((scenario) => ({
      ...scenario,
      rubric: scoreScenario(scenario, scenario.imageResults),
    }))
    .sort(
      (left, right) =>
        SCENARIO_IDS.indexOf(left.scenarioId) - SCENARIO_IDS.indexOf(right.scenarioId),
    ),
});

const ensureBrowserForNextWave = async (
  env: E2eEnv,
  browserConnection: Awaited<ReturnType<typeof connectBrowser>>,
): Promise<Awaited<ReturnType<typeof connectBrowser>>> => {
  if (await heartbeat(browserConnection.browser)) {
    return browserConnection;
  }
  console.error("[run] browser heartbeat lost, reconnecting for next wave");
  return connectBrowser(env);
};

const persistScenarioResult = async (
  ctx: RunContext,
  scenario: ScenarioResult,
): Promise<RunContext> => {
  const nextManifest = upsertScenario(ctx.manifest, scenario);
  await writeManifest(ctx.manifestPath, nextManifest);
  return {
    ...ctx,
    manifest: nextManifest,
  };
};

const finalizeManifest = async (ctx: RunContext): Promise<RunContext> => {
  const scoredManifest = scoreManifest({
    ...ctx.manifest,
    completedAt: new Date().toISOString(),
    status: resolveRunStatus(ctx.manifest.scenarios),
    terminationReason: resolveTerminationReason(ctx.manifest.scenarios),
  });
  await writeManifest(ctx.manifestPath, scoredManifest);
  await writeSummary(scoredManifest, ctx.env.resultsRoot, { allowFinal: false });
  return {
    ...ctx,
    manifest: scoredManifest,
  };
};

const initializeRunContext = async (
  env: E2eEnv,
  configuredModel: ConfiguredModelResolution,
  versionInfo: VersionInfo,
): Promise<RunContext> => {
  const { manifestPath } = getPaths(env.resultsRoot, env.runId);
  const resumed = await fileExists(manifestPath);
  const manifest = createInitialManifest({
    runId: env.runId,
    cdpPort: env.cdpPort,
    configuredModel: configuredModel.value,
    node: versionInfo.node,
    playwright: versionInfo.playwright,
    chrome: versionInfo.chrome,
  });
  const runManifest: RunManifest = {
    ...manifest,
    status: resumed ? "resumed" : "started",
  };
  await writeManifest(manifestPath, runManifest);
  return {
    env,
    manifest: runManifest,
    manifestPath,
  };
};

const buildPlan = async (cli: CliOptions): Promise<RunPlan> => {
  const resolvedModel = await resolveConfiguredModel();
  console.error(`[run] configuredModel=${resolvedModel.value} source=${resolvedModel.source}`);

  const baseEnv = resolveEnv(cli.runId ? { runId: cli.runId } : {});
  const env: E2eEnv = cli.smoke ? { ...baseEnv, runId: `${baseEnv.runId}-smoke` } : baseEnv;

  const scenarios = buildScenarioSelection(cli);
  return {
    env,
    configuredModel: resolvedModel,
    scenarios,
    waves: buildWaves(scenarios),
  };
};

const findVersionCheckDetail = (report: Awaited<ReturnType<typeof enforcePreflight>>): string => {
  const versionCheck = report.checks.find((check) => check.name === "version.pin");
  return versionCheck?.detail ?? "";
};

const abortManifest = async (ctx: RunContext | null, error: unknown): Promise<void> => {
  if (ctx === null) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const abortedManifest: RunManifest = {
    ...ctx.manifest,
    completedAt: new Date().toISOString(),
    status: "aborted",
    terminationReason: message,
  };
  await writeManifest(ctx.manifestPath, abortedManifest);
};

export const main = async (argv: string[]): Promise<number> => {
  const cli = parseCliArgs(argv);
  if (cli.help) {
    console.error(USAGE);
    return 0;
  }

  let runContext: RunContext | null = null;
  let browserConnection: Awaited<ReturnType<typeof connectBrowser>> | null = null;

  try {
    const plan = await buildPlan(cli);
    const preflight = await enforcePreflight(plan.env, plan.configuredModel.value);
    const versionInfo = extractVersionInfo(findVersionCheckDetail(preflight));
    runContext = await initializeRunContext(plan.env, plan.configuredModel, versionInfo);

    browserConnection = await connectBrowser(plan.env);
    const { runDir } = getPaths(plan.env.resultsRoot, plan.env.runId);

    for (const wave of plan.waves) {
      const results = await runWave(browserConnection.browser, plan.env, runDir, wave);
      for (const scenario of results) {
        runContext = await persistScenarioResult(runContext, scenario);
      }
      browserConnection = await ensureBrowserForNextWave(plan.env, browserConnection);
    }

    await closeLingeringContexts(browserConnection.browser);
    runContext = await finalizeManifest(runContext);
    return runContext.manifest.status === "completed" ? 0 : 1;
  } catch (error) {
    await abortManifest(runContext, error);
    console.error("[run] fatal", error);
    return 1;
  } finally {
    if (browserConnection !== null) {
      await browserConnection.browser.close().catch(() => undefined);
    }
  }
};

process.on("unhandledRejection", (reason) => {
  console.error("[run] unhandledRejection", reason);
});

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
}
