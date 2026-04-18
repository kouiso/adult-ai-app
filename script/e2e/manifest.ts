import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  normalizeRunManifest,
  normalizeScenarioManifest,
  runManifestSchema,
  scenarioResultSchema,
  type ImageResult,
  type RunManifest,
  type ScenarioId,
  type ScenarioManifest,
  type ScenarioResult,
  type TurnManifest,
  type TurnResult,
} from "./types";

import type { E2EEnv } from "./env";

export type ManifestPaths = {
  runDir: string;
  manifestPath: string;
  runManifestPath: string;
  preflightPath: string;
  summaryPath: string;
};

const compatManifestFileName = "manifest.json";
const primaryRunManifestFileName = "run-manifest.json";
const scenarioManifestFileName = "scenario-manifest.json";
const compatScenarioFileName = "scenario.json";

const scenarioStatusFromRunStatus = (status: RunManifest["status"]): ScenarioManifest["status"] => {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
    case "aborted":
      return "failed";
    case "pending":
      return "pending";
    default:
      return "running";
  }
};

export const getPaths = (resultsRoot: string, runId: string): ManifestPaths => {
  const runDir = path.join(resultsRoot, "runs", runId);
  return {
    runDir,
    manifestPath: path.join(runDir, compatManifestFileName),
    runManifestPath: path.join(runDir, primaryRunManifestFileName),
    preflightPath: path.join(runDir, "preflight.json"),
    summaryPath: path.join(runDir, "summary.md"),
  };
};

export const getScenarioDir = (runDir: string, scenarioId: ScenarioId): string =>
  path.join(runDir, scenarioId);

export const getScenarioImagesDir = (runDir: string, scenarioId: ScenarioId): string =>
  path.join(getScenarioDir(runDir, scenarioId), "images");

export const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

export const atomicWriteJson = async (filePath: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.tmp-${randomUUID().split("-")[0]}`;
  await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temporaryPath, filePath);
};

export const atomicWriteText = async (filePath: string, content: string): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.tmp-${randomUUID().split("-")[0]}`;
  await fs.writeFile(temporaryPath, content, "utf8");
  await fs.rename(temporaryPath, filePath);
};

const scenarioManifestPath = (scenario: { artifactsDir?: string; scenarioId: string }): string => {
  const artifactsDir = scenario.artifactsDir;
  if (!artifactsDir) {
    throw new Error(`scenario artifactsDir が未設定です: ${scenario.scenarioId}`);
  }
  return path.join(artifactsDir, scenarioManifestFileName);
};

const compatScenarioPath = (scenario: { artifactsDir?: string; scenarioId: string }): string => {
  const artifactsDir = scenario.artifactsDir;
  if (!artifactsDir) {
    throw new Error(`scenario artifactsDir が未設定です: ${scenario.scenarioId}`);
  }
  return path.join(artifactsDir, compatScenarioFileName);
};

const normalizeRunForWrite = (manifest: RunManifest): RunManifest =>
  runManifestSchema.parse(normalizeRunManifest(manifest));

const normalizeScenarioForWrite = (scenario: ScenarioManifest | ScenarioResult): ScenarioResult =>
  scenarioResultSchema.parse(normalizeScenarioManifest(scenario));

export const createRunManifest = async (env: E2EEnv): Promise<RunManifest> => {
  await ensureDir(env.artifactRoot);
  return {
    runId: env.runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    scenarios: [],
    rubricScore: null,
    artifactsDir: env.artifactRoot,
    completedAt: null,
    cdpPort: env.cdpPort,
    configuredModel: process.env.E2E_CONFIGURED_MODEL ?? "unknown",
  };
};

export const writeRunManifest = async (manifest: RunManifest): Promise<void> => {
  const normalized = normalizeRunForWrite(manifest);
  const artifactsDir = normalized.artifactsDir;
  if (!artifactsDir) {
    throw new Error("run manifest artifactsDir が未設定です");
  }
  await atomicWriteJson(path.join(artifactsDir, primaryRunManifestFileName), normalized);
  await atomicWriteJson(path.join(artifactsDir, compatManifestFileName), normalized);
};

export const appendScenarioManifest = async (
  runManifest: RunManifest,
  scenario: ScenarioManifest | ScenarioResult,
): Promise<RunManifest> => {
  const normalizedRun = normalizeRunForWrite(runManifest);
  const scenarioDir =
    scenario.artifactsDir ?? path.join(normalizedRun.artifactsDir ?? "", scenario.scenarioId);
  const normalizedScenario = normalizeScenarioForWrite({
    ...scenario,
    artifactsDir: scenarioDir,
  });

  await ensureDir(scenarioDir);

  const nextScenarios = normalizedRun.scenarios.some(
    (entry) => entry.scenarioId === normalizedScenario.scenarioId,
  )
    ? normalizedRun.scenarios.map((entry) =>
        entry.scenarioId === normalizedScenario.scenarioId ? normalizedScenario : entry,
      )
    : [...normalizedRun.scenarios, normalizedScenario];

  const nextManifest = normalizeRunForWrite({
    ...normalizedRun,
    scenarios: nextScenarios,
  });

  await atomicWriteJson(scenarioManifestPath(normalizedScenario), normalizedScenario);
  await atomicWriteJson(compatScenarioPath(normalizedScenario), normalizedScenario);
  await writeRunManifest(nextManifest);

  return nextManifest;
};

export const appendTurnManifest = async (
  scenario: ScenarioManifest,
  turn: TurnManifest,
): Promise<ScenarioManifest> => {
  const nextScenario: ScenarioManifest = {
    ...scenario,
    turns: [...scenario.turns.filter((entry) => entry.turnIndex !== turn.turnIndex), turn].sort(
      (left, right) => left.turnIndex - right.turnIndex,
    ),
  };

  await ensureDir(nextScenario.artifactsDir);
  await atomicWriteJson(scenarioManifestPath(nextScenario), nextScenario);
  await atomicWriteJson(compatScenarioPath(nextScenario), nextScenario);

  return nextScenario;
};

export const loadManifest = async (manifestPath: string): Promise<RunManifest> => {
  const raw = await fs.readFile(manifestPath, "utf8");
  return normalizeRunForWrite(JSON.parse(raw));
};

export const createInitialManifest = (opts: {
  runId: string;
  cdpPort: number;
  configuredModel: string;
  node: string;
  playwright: string;
  chrome: string;
}): RunManifest => ({
  runId: opts.runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "started",
  scenarios: [],
  rubricScore: null,
  artifactsDir: path.join(".work", "e2e-results", "runs", opts.runId),
  completedAt: null,
  node: opts.node,
  playwright: opts.playwright,
  chrome: opts.chrome,
  cdpPort: opts.cdpPort,
  configuredModel: opts.configuredModel,
  terminationReason: null,
});

export const writeManifest = async (manifestPath: string, manifest: RunManifest): Promise<void> => {
  const normalized = normalizeRunForWrite(manifest);
  await atomicWriteJson(manifestPath, normalized);

  const siblingRunManifestPath = path.join(path.dirname(manifestPath), primaryRunManifestFileName);
  if (siblingRunManifestPath !== manifestPath) {
    await atomicWriteJson(siblingRunManifestPath, normalized);
  }
};

export const upsertScenario = (manifest: RunManifest, scenario: ScenarioResult): RunManifest => {
  const nextScenarios = manifest.scenarios.some((entry) => entry.scenarioId === scenario.scenarioId)
    ? manifest.scenarios.map((entry) =>
        entry.scenarioId === scenario.scenarioId ? scenario : entry,
      )
    : [...manifest.scenarios, scenario];

  return {
    ...manifest,
    scenarios: nextScenarios,
  };
};

export const appendTurn = (scenario: ScenarioResult, turn: TurnResult): ScenarioResult => ({
  ...scenario,
  turns: [...scenario.turns.filter((entry) => entry.turnIndex !== turn.turnIndex), turn].sort(
    (left, right) => left.turnIndex - right.turnIndex,
  ),
});

export const appendImage = (scenario: ScenarioResult, image: ImageResult): ScenarioResult => ({
  ...scenario,
  imageResults: [
    ...(scenario.imageResults ?? []).filter((entry) => entry.turnIndex !== image.turnIndex),
    image,
  ].sort((left, right) => left.turnIndex - right.turnIndex),
});

export const toScenarioManifest = (
  runManifest: RunManifest,
  scenarioId: string,
): ScenarioManifest => ({
  scenarioId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: scenarioStatusFromRunStatus(runManifest.status),
  turns: [],
  rubricScore: null,
  artifactsDir: path.join(runManifest.artifactsDir ?? "", scenarioId),
  conversationId: "",
  terminationReason: null,
});
