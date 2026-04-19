import { promises as fs } from "node:fs";
import path from "node:path";

import { getQueue } from "./action-queue";
import { buildLocalAuthHeaders } from "./auth";
import { heartbeat, closeContext, createContext } from "./browser";
import {
  SCENARIO_TIMEOUT_MS,
  TURN_TIMEOUT_MS,
  waitForMessageCount,
  waitForStreamComplete,
} from "./browser-wait";
import { setupFreshConversation } from "./conversation-setup";
import { classifyFailure, type FailureCategory } from "./failure-taxonomy";
import { runD1PersistenceJudge, waitForD1Durability } from "./judges/d1-persistence";
import { probeR2Stages, runR2PersistenceJudge } from "./judges/r2-persistence";
import { judgePhase } from "./judges/scene-phase";
import { runUISuccessJudge } from "./judges/ui-success";
import {
  appendImage,
  appendTurn,
  atomicWriteJson,
  getScenarioDir,
  getScenarioImagesDir,
} from "./manifest";

import type { E2eEnv } from "./env";
import type {
  JudgeVerdict,
  JudgeVerdictSet,
  Phase,
  ScenarioId,
  ScenarioResult,
  TurnResult,
} from "./types";
import type { Browser, ConsoleMessage, Page, Response } from "playwright";

export type ScenarioDefinition = {
  scenarioId: ScenarioId;
  characterSlug: string;
  turns: Array<{
    turnIndex: number;
    userMsg: string;
    expectedPhase: Phase;
    isImageTrigger?: boolean;
    isMonkey?: boolean;
    monkeyKind?: string;
  }>;
  onFailFast?: (turn: number, failureCategory: FailureCategory) => boolean;
};

type QualityGuardEvent = {
  attempt: number;
  passed: boolean;
  failedCheck: string | null;
  message: string;
  ts: number;
};

type ChatResponseEvent = {
  usedModel: string | null;
  ts: number;
};

type PersistedMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const MESSAGE_GROUP_SELECTOR = ".group\\/message";
const INPUT_SELECTOR = 'textarea[placeholder="メッセージを入力..."]';
const SEND_BUTTON_SELECTOR = 'button[title="送信"]';
const IMAGE_SELECTOR = 'img[alt="Generated"]';
const TURN_PAD = 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const toFailureDetail = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const formatTurn = (turnIndex: number): string => String(turnIndex).padStart(TURN_PAD, "0");

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

const scenarioSnapshotPath = (runDir: string, scenarioId: ScenarioId): string =>
  path.join(getScenarioDir(runDir, scenarioId), "scenario.partial.json");

const writeScenarioSnapshot = async (runDir: string, scenario: ScenarioResult): Promise<void> => {
  await atomicWriteJson(scenarioSnapshotPath(runDir, scenario.scenarioId), scenario);
};

const parsePersistedMessages = (value: unknown): PersistedMessage[] => {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    return [];
  }

  return value.messages.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const role = readString(entry.role);
    const content = readString(entry.content);
    if ((role === "user" || role === "assistant" || role === "system") && content !== null) {
      return [{ role, content }];
    }
    return [];
  });
};

const listPersistedMessages = async (
  page: Page,
  env: E2eEnv,
  conversationId: string,
): Promise<PersistedMessage[]> => {
  const response = await page
    .context()
    .request.get(
      `${env.devOrigin}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        failOnStatusCode: false,
        headers: buildLocalAuthHeaders(env.userEmail),
        timeout: 30_000,
      },
    );
  if (!response.ok()) {
    throw new Error(`list messages failed: ${response.status()}`);
  }
  const payload: unknown = await response.json();
  return parsePersistedMessages(payload);
};

const readAssistantText = async (page: Page): Promise<string> =>
  (async () => {
    const count = await page.locator(MESSAGE_GROUP_SELECTOR).count();
    for (let index = count - 1; index >= 0; index -= 1) {
      const group = page.locator(MESSAGE_GROUP_SELECTOR).nth(index);
      const className = (await group.getAttribute("class")) ?? "";
      if (className.includes("flex-row-reverse")) continue;
      const text = (await group.locator(".rounded-2xl").first().textContent())?.trim() ?? "";
      return text;
    }
    return "";
  })();

const readRenderedMessageCount = async (page: Page): Promise<number> =>
  page.locator(MESSAGE_GROUP_SELECTOR).count();

const parseQualityGuardEvent = (msg: ConsoleMessage): QualityGuardEvent | null => {
  if (msg.type() !== "info") return null;
  const text = msg.text();
  if (!text.includes("[quality-guard]")) return null;

  const attemptMatch = text.match(/attempt=(\d+)/);
  const passedMatch = text.match(/passed=(true|false)/);
  const failedMatch = text.match(/failed=(\S+)/);
  const attempt = attemptMatch ? Number(attemptMatch[1]) : 0;
  const passed = passedMatch ? passedMatch[1] === "true" : false;
  const failedCheck = failedMatch && failedMatch[1] !== "none" ? failedMatch[1] : null;

  return {
    attempt,
    passed,
    failedCheck,
    message: text,
    ts: Date.now(),
  };
};

const toChatResponseEvent = (response: Response): ChatResponseEvent | null => {
  if (!response.url().includes("/api/chat")) return null;
  const usedModel = response.headers()["x-model-used"] ?? null;
  return {
    usedModel,
    ts: Date.now(),
  };
};

const buildTurnFailure = (
  turnIndex: number,
  userMsg: string,
  expectedPhase: Phase,
  screenshotPath: string,
  detail: string,
  failureCategory: FailureCategory,
  renderedMessageCount: number,
  persistedMessageCount: number,
): TurnResult => ({
  turnIndex,
  userMsg,
  assistantMsg: "",
  expectedPhase,
  detectedPhase: null,
  phaseMonotonicViolation: false,
  usedModel: null,
  qualityRetries: 0,
  failedCheck: null,
  renderedMessageCount,
  persistedMessageCount,
  firstTokenMs: null,
  lastChunkMs: null,
  hasDoneSignal: false,
  screenshotPath,
  wallClockMs: 0,
  failureCategory,
  failureDetail: detail,
});

const takeTurnScreenshot = async (
  page: Page,
  runDir: string,
  scenarioId: ScenarioId,
  turnIndex: number,
): Promise<string> => {
  const screenshotPath = path.join(
    getScenarioDir(runDir, scenarioId),
    `turn-${formatTurn(turnIndex)}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
};

const captureImageResult = async (
  page: Page,
  env: E2eEnv,
  runDir: string,
  scenarioId: ScenarioId,
  conversationId: string,
  turnIndex: number,
): Promise<{
  novitaUrlReceived: boolean;
  r2KeyPersisted: boolean;
  reloadDisplayed: boolean;
  contentType: string;
  naturalWidth: number;
  novitaUrl: string | null;
  r2Url: string | null;
  novitaPath: string | null;
  r2ReloadPath: string | null;
  judgeVerdicts: Pick<JudgeVerdictSet, "r2" | "reload">;
}> => {
  await ensureDir(getScenarioImagesDir(runDir, scenarioId));

  const screenshotBeforeReloadPath = path.join(
    getScenarioImagesDir(runDir, scenarioId),
    `T${formatTurn(turnIndex)}-novita.png`,
  );
  const screenshotAfterReloadPath = path.join(
    getScenarioImagesDir(runDir, scenarioId),
    `T${formatTurn(turnIndex)}-r2-reload.png`,
  );
  const probeResult = await probeR2Stages(page, {
    conversationId,
    env,
    imgSelector: IMAGE_SELECTOR,
    domReadySelector: INPUT_SELECTOR,
    screenshotBeforeReloadPath,
    screenshotAfterReloadPath,
  });
  const judgeVerdicts = await runR2PersistenceJudge(page, probeResult);

  return {
    novitaUrlReceived: probeResult.novitaUrlReceived,
    r2KeyPersisted: probeResult.r2KeyPersisted,
    reloadDisplayed: probeResult.reloadDisplayed,
    contentType: probeResult.contentType,
    naturalWidth: probeResult.naturalWidth,
    novitaUrl: probeResult.novitaUrl,
    r2Url: probeResult.r2Url,
    novitaPath: probeResult.screenshotBeforeReload,
    r2ReloadPath: probeResult.screenshotAfterReload,
    judgeVerdicts,
  };
};

const aggregateJudgeVerdict = (
  verdicts: Array<JudgeVerdict | null | undefined>,
): JudgeVerdict | null => {
  const present = verdicts.filter(
    (verdict): verdict is JudgeVerdict => verdict !== null && verdict !== undefined,
  );
  if (present.length === 0) return null;

  const failure = present.find((verdict) => !verdict.pass);
  if (failure) {
    return {
      pass: false,
      reason: failure.reason,
    };
  }

  return {
    pass: true,
    reason: `${present.length}/${present.length} checks passed`,
  };
};

const aggregateScenarioJudgeVerdicts = (scenario: ScenarioResult): JudgeVerdictSet => ({
  ui: aggregateJudgeVerdict(scenario.turns.map((turn) => turn.judgeVerdicts?.ui)),
  d1: aggregateJudgeVerdict(scenario.turns.map((turn) => turn.judgeVerdicts?.d1)),
  r2: aggregateJudgeVerdict(scenario.turns.map((turn) => turn.judgeVerdicts?.r2)),
  reload: aggregateJudgeVerdict(scenario.turns.map((turn) => turn.judgeVerdicts?.reload)),
});

const scenarioDeadlineRemaining = (startedAtMs: number): number =>
  SCENARIO_TIMEOUT_MS - (Date.now() - startedAtMs);

const shouldFailFast = (
  def: ScenarioDefinition,
  turn: number,
  failureCategory: FailureCategory,
): boolean => (def.onFailFast ? def.onFailFast(turn, failureCategory) : false);

export async function runScenario(
  browser: Browser,
  env: E2eEnv,
  def: ScenarioDefinition,
  runDir: string,
): Promise<ScenarioResult> {
  const queue = getQueue(def.scenarioId);

  return queue.enqueue(async () => {
    const scenarioDir = getScenarioDir(runDir, def.scenarioId);
    const imagesDir = getScenarioImagesDir(runDir, def.scenarioId);
    await ensureDir(scenarioDir);
    await ensureDir(imagesDir);

    const startedAtIso = new Date().toISOString();
    const startedAtMs = Date.now();
    const qualityEvents: QualityGuardEvent[] = [];
    const chatResponses: ChatResponseEvent[] = [];
    let previousDetectedPhase: Phase | null = null;
    let page: Page | null = null;
    let context: Awaited<ReturnType<typeof createContext>> | null = null;

    let scenario: ScenarioResult = {
      scenarioId: def.scenarioId,
      conversationId: "pending",
      characterSlug: def.characterSlug,
      startedAt: startedAtIso,
      completedAt: null,
      status: "setup_failure",
      terminationReason: null,
      turns: [],
      imageResults: [],
      rubric: null,
      provisional: true,
      failureCategory: null,
    };

    try {
      context = await createContext(browser);
      page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          console.error(`[browser-console][${def.scenarioId}] ${msg.type()}: ${msg.text()}`);
        }
        const parsed = parseQualityGuardEvent(msg);
        if (parsed) qualityEvents.push(parsed);
      });
      page.on("response", (response) => {
        const parsed = toChatResponseEvent(response);
        if (parsed) chatResponses.push(parsed);
      });

      const setup = await setupFreshConversation(
        page,
        env,
        def.scenarioId,
        def.characterSlug,
        env.userEmail,
      );
      scenario = {
        ...scenario,
        conversationId: setup.conversationId,
        status: "completed",
      };
      await writeScenarioSnapshot(runDir, scenario);
      const greetingMessageCount = await readRenderedMessageCount(page);

      for (const turn of def.turns) {
        if (!(await heartbeat(browser))) {
          scenario = {
            ...scenario,
            status: "aborted",
            completedAt: new Date().toISOString(),
            terminationReason: "browser heartbeat failed",
            failureCategory: "test.flaky",
          };
          await writeScenarioSnapshot(runDir, scenario);
          return scenario;
        }

        const remainingScenarioMs = scenarioDeadlineRemaining(startedAtMs);
        if (remainingScenarioMs <= 0) {
          scenario = {
            ...scenario,
            status: "aborted",
            completedAt: new Date().toISOString(),
            terminationReason: "scenario_timeout",
            failureCategory: "test.flaky",
          };
          await writeScenarioSnapshot(runDir, scenario);
          return scenario;
        }

        const turnTimeoutMs = Math.min(TURN_TIMEOUT_MS, remainingScenarioMs);
        const turnStartedAt = Date.now();
        const qualityStart = qualityEvents.length;
        const responseStart = chatResponses.length;
        const baselineMessageCount = await readRenderedMessageCount(page);
        const expectedRenderedCount = baselineMessageCount + 2;
        const screenshotFallbackPath = path.join(
          scenarioDir,
          `turn-${formatTurn(turn.turnIndex)}.png`,
        );

        try {
          await withTimeout(
            (async () => {
              const input = page.locator(INPUT_SELECTOR);
              await input.fill(turn.userMsg);
              await page.locator(SEND_BUTTON_SELECTOR).click({ force: true });
              await waitForMessageCount(page, expectedRenderedCount, turnTimeoutMs);
            })(),
            turnTimeoutMs,
            `turn-${turn.turnIndex}-send`,
          );

          const streamStats = await withTimeout(
            waitForStreamComplete(page, turnTimeoutMs),
            turnTimeoutMs,
            `turn-${turn.turnIndex}-stream`,
          );

          const assistantMsg = await readAssistantText(page);
          const renderedMessageCount = await readRenderedMessageCount(page);
          const expectedPersistedCount = Math.max(0, renderedMessageCount - greetingMessageCount);
          // streaming 後 assistant row 永続化までの race を barrier で吸収 (v2 P0d)
          const d1Barrier = await waitForD1Durability({
            userEmail: env.userEmail,
            conversationId: scenario.conversationId,
            expectedCount: expectedPersistedCount,
          });
          const screenshotPath = await takeTurnScreenshot(
            page,
            runDir,
            def.scenarioId,
            turn.turnIndex,
          );
          const persistedMessages = await listPersistedMessages(page, env, scenario.conversationId);
          const phaseJudgment = judgePhase({
            assistantMsg,
            expectedPhase: turn.expectedPhase,
            previousDetected: previousDetectedPhase,
          });
          const detectedPhase = phaseJudgment.detected;
          const phaseMonotonicViolation = phaseJudgment.monotonicViolation;
          previousDetectedPhase = detectedPhase;

          const turnQualityEvents = qualityEvents.slice(qualityStart);
          const turnResponses = chatResponses.slice(responseStart);
          const qualityRetries = turnQualityEvents.reduce(
            (max, event) => Math.max(max, event.attempt),
            0,
          );
          const finalQualityEvent = turnQualityEvents.at(-1) ?? null;
          const failedCheck =
            finalQualityEvent && !finalQualityEvent.passed ? finalQualityEvent.failedCheck : null;
          const usedModel = turnResponses.at(-1)?.usedModel ?? null;
          const uiJudgeVerdict = runUISuccessJudge({
            renderedMessageCount,
            previousCount: baselineMessageCount,
            hasDoneSignal: streamStats.hasDoneSignal,
            firstTokenMs: streamStats.firstTokenMs,
          });
          const d1JudgeVerdict = await runD1PersistenceJudge({
            conversationId: scenario.conversationId,
            renderedMessageCount,
            greetingMessageCount,
          });

          let turnResult: TurnResult = {
            turnIndex: turn.turnIndex,
            userMsg: turn.userMsg,
            assistantMsg,
            expectedPhase: turn.expectedPhase,
            detectedPhase,
            phaseMonotonicViolation,
            usedModel,
            qualityRetries,
            failedCheck,
            renderedMessageCount,
            persistedMessageCount: persistedMessages.length,
            d1BarrierSettled: d1Barrier.settled,
            d1BarrierElapsedMs: d1Barrier.elapsedMs,
            d1BarrierLastCount: d1Barrier.lastCount,
            d1BarrierTimeout: d1Barrier.settled ? undefined : true,
            firstTokenMs: streamStats.firstTokenMs,
            lastChunkMs: streamStats.lastChunkMs,
            hasDoneSignal: streamStats.hasDoneSignal,
            screenshotPath,
            wallClockMs: Date.now() - turnStartedAt,
            failureCategory: failedCheck
              ? classifyFailure({ message: failedCheck, context: "quality-guard" })
              : null,
            failureDetail: failedCheck,
            judgeVerdicts: {
              ui: uiJudgeVerdict,
              d1: d1JudgeVerdict,
              r2: null,
              reload: null,
            },
          };

          scenario = appendTurn(scenario, turnResult);

          if (turn.isImageTrigger) {
            // autoGenerateImages 設定は現状 UI 上の飾りで、
            // 実際の画像生成は ChatInput の「画像生成」ボタンを押した時のみ発火する。
            // そのため isImageTrigger turn では runner 側で明示的にボタンをクリックしてから probe する。
            await page
              .locator('button[title="画像生成"]')
              .click({ timeout: 10_000 })
              .catch(() => undefined);
            const image = await withTimeout(
              captureImageResult(
                page,
                env,
                runDir,
                def.scenarioId,
                scenario.conversationId,
                turn.turnIndex,
              ),
              turnTimeoutMs,
              `turn-${turn.turnIndex}-image`,
            );
            scenario = appendImage(scenario, {
              turnIndex: turn.turnIndex,
              novitaUrlReceived: image.novitaUrlReceived,
              r2KeyPersisted: image.r2KeyPersisted,
              reloadDisplayed: image.reloadDisplayed,
              contentType: image.contentType,
              naturalWidth: image.naturalWidth,
              novitaUrl: image.novitaUrl,
              r2Url: image.r2Url,
              novitaPath: image.novitaPath,
              r2ReloadPath: image.r2ReloadPath,
              reviewerSignature: null,
              reviewerNotes: null,
            });
            turnResult = {
              ...turnResult,
              judgeVerdicts: {
                ...(turnResult.judgeVerdicts ?? {
                  ui: null,
                  d1: null,
                  r2: null,
                  reload: null,
                }),
                r2: image.judgeVerdicts.r2,
                reload: image.judgeVerdicts.reload,
              },
            };
            scenario = appendTurn(scenario, turnResult);
          }

          scenario = {
            ...scenario,
            judgeVerdicts: aggregateScenarioJudgeVerdicts(scenario),
          };

          await writeScenarioSnapshot(runDir, scenario);

          if (phaseMonotonicViolation) {
            const failureCategory: FailureCategory = "test.flaky";
            if (shouldFailFast(def, turn.turnIndex, failureCategory)) {
              turnResult = {
                ...turnResult,
                failureCategory,
                failureDetail: "phase monotonic regression",
              };
              scenario = appendTurn(scenario, turnResult);
              scenario = {
                ...scenario,
                status: "fail_fast",
                completedAt: new Date().toISOString(),
                terminationReason: "phase_monotonic_violation",
                failureCategory,
              };
              await writeScenarioSnapshot(runDir, scenario);
              return scenario;
            }
          }
        } catch (error) {
          const detail = toFailureDetail(error);
          const failureCategory = classifyFailure({ message: detail, context: "browser" });
          const screenshotPath = await takeTurnScreenshot(
            page,
            runDir,
            def.scenarioId,
            turn.turnIndex,
          ).catch(async () => screenshotFallbackPath);
          const persistedMessageCount = await listPersistedMessages(
            page,
            env,
            scenario.conversationId,
          )
            .then((messages) => messages.length)
            .catch(() => 0);
          const renderedMessageCount = await readRenderedMessageCount(page).catch(() => 0);
          const turnResult = buildTurnFailure(
            turn.turnIndex,
            turn.userMsg,
            turn.expectedPhase,
            screenshotPath,
            detail,
            failureCategory,
            renderedMessageCount,
            persistedMessageCount,
          );
          scenario = appendTurn(scenario, turnResult);
          scenario = {
            ...scenario,
            status: shouldFailFast(def, turn.turnIndex, failureCategory) ? "fail_fast" : "aborted",
            completedAt: new Date().toISOString(),
            terminationReason: detail.includes("timed out") ? "turn_timeout" : detail,
            failureCategory,
          };
          await writeScenarioSnapshot(runDir, scenario);
          return scenario;
        }
      }

      scenario = {
        ...scenario,
        status: "completed",
        completedAt: new Date().toISOString(),
        terminationReason: null,
        judgeVerdicts: aggregateScenarioJudgeVerdicts(scenario),
      };
      await writeScenarioSnapshot(runDir, scenario);
      return scenario;
    } catch (error) {
      const detail = toFailureDetail(error);
      scenario = {
        ...scenario,
        completedAt: new Date().toISOString(),
        status: "setup_failure",
        terminationReason: detail,
        failureCategory: classifyFailure({ message: detail, context: "preflight" }),
      };
      await writeScenarioSnapshot(runDir, scenario);
      return scenario;
    } finally {
      if (context) {
        await closeContext(context);
      }
    }
  });
}
