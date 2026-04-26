import { z } from "zod";

export const SCENARIO_IDS = ["S1", "S2", "S3", "S4", "S5"] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const PHASES = ["conversation", "intimate", "erotic", "climax", "afterglow"] as const;
export type Phase = (typeof PHASES)[number];

export const MANIFEST_STATUSES = ["pending", "running", "passed", "failed"] as const;
export type ManifestStatus = (typeof MANIFEST_STATUSES)[number];

export const RUN_STATUSES = [
  ...MANIFEST_STATUSES,
  "started",
  "completed",
  "aborted",
  "resumed",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const SCENARIO_STATUSES = [
  ...MANIFEST_STATUSES,
  "completed",
  "aborted",
  "setup_failure",
  "fail_fast",
] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

export const rubricScoreSchema = z.object({
  sceneAlignment: z.number().min(0).max(25),
  eroticDensity: z.number().min(0).max(25),
  characterConsistency: z.number().min(0).max(20),
  escalationNaturalness: z.number().min(0).max(15),
  noMetaRemarks: z.number().min(0).max(15),
  bonuses: z.object({
    creampie: z.number().min(-10).max(10),
    afterglow: z.number().min(-10).max(10),
    image: z.number().min(-15).max(15),
  }),
  eventWeightedTotal: z.number(),
  rawTotal: z.number(),
});
export type RubricScore = z.infer<typeof rubricScoreSchema>;

export const imageReviewerNotesSchema = z.object({
  sceneAlignment: z.number().min(0).max(10),
  nsfwLevel: z.number().min(0).max(10),
  characterConsistency: z.number().min(0).max(10),
  comments: z.string(),
});
export type ImageReviewerNotes = z.infer<typeof imageReviewerNotesSchema>;

export const qualityCheckResultSchema = z.object({
  passed: z.boolean(),
  failedCheck: z.string().nullable(),
  retries: z.number().int().min(0),
  details: z.array(z.string()),
});
export type QualityCheckResult = z.infer<typeof qualityCheckResultSchema>;

export const judgeVerdictSchema = z.object({
  pass: z.boolean(),
  reason: z.string().nullable(),
});
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export const judgeVerdictSetSchema = z.object({
  ui: judgeVerdictSchema.nullable(),
  d1: judgeVerdictSchema.nullable(),
  r2: judgeVerdictSchema.nullable(),
  reload: judgeVerdictSchema.nullable(),
});
export type JudgeVerdictSet = z.infer<typeof judgeVerdictSetSchema>;

export const turnTimingSchema = z.object({
  firstTokenMs: z.number().nullable(),
  lastChunkMs: z.number().nullable(),
  wallClockMs: z.number().min(0),
});
export type TurnTiming = z.infer<typeof turnTimingSchema>;

const turnFailureSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
});
export type TurnFailure = z.infer<typeof turnFailureSchema>;

export const imageResultSchema = z.object({
  turnIndex: z.number().int().min(1),
  novitaUrlReceived: z.boolean(),
  r2KeyPersisted: z.boolean(),
  reloadDisplayed: z.boolean(),
  contentType: z.string(),
  naturalWidth: z.number().int().min(0),
  novitaUrl: z.string().nullable(),
  r2Url: z.string().nullable(),
  novitaPath: z.string().nullable(),
  r2ReloadPath: z.string().nullable(),
  reviewerSignature: z.string().nullable(),
  reviewerNotes: imageReviewerNotesSchema.nullable(),
});
export type ImageResult = z.infer<typeof imageResultSchema>;

export const imageProbeResultSchema = z.object({
  novitaUrlReceived: z.boolean(),
  r2KeyPersisted: z.boolean(),
  reloadDisplayed: z.boolean(),
  contentType: z.string(),
  naturalWidth: z.number().int().min(0),
  novitaUrl: z.string().nullable(),
  r2Url: z.string().nullable(),
  screenshotBeforeReload: z.string().nullable(),
  screenshotAfterReload: z.string().nullable(),
});
export type ImageProbeResult = z.infer<typeof imageProbeResultSchema>;

export const turnManifestSchema = z.object({
  turnIndex: z.number().int().min(1),
  userMessage: z.string(),
  assistantText: z.string(),
  scenePhase: z.object({
    expected: z.enum(PHASES).nullable(),
    detected: z.enum(PHASES).nullable(),
    violatedMonotonicity: z.boolean(),
  }),
  imageUrls: z.array(z.string()),
  qualityCheck: qualityCheckResultSchema,
  timings: turnTimingSchema,
  failures: z.array(turnFailureSchema),
  judgeVerdicts: judgeVerdictSetSchema.optional(),
});
export type TurnManifest = z.infer<typeof turnManifestSchema>;

export const turnResultSchema = z.object({
  turnIndex: z.number().int().min(1),
  userMsg: z.string(),
  assistantMsg: z.string(),
  expectedPhase: z.enum(PHASES),
  detectedPhase: z.enum(PHASES).nullable(),
  phaseMonotonicViolation: z.boolean(),
  usedModel: z.string().nullable(),
  qualityRetries: z.number().int().min(0),
  failedCheck: z.string().nullable(),
  renderedMessageCount: z.number().int().min(0),
  persistedMessageCount: z.number().int().min(0),
  d1BarrierSettled: z.boolean().optional(),
  d1BarrierElapsedMs: z.number().min(0).optional(),
  d1BarrierLastCount: z.number().int().min(0).optional(),
  d1BarrierTimeout: z.boolean().optional(),
  firstTokenMs: z.number().nullable(),
  lastChunkMs: z.number().nullable(),
  hasDoneSignal: z.boolean(),
  screenshotPath: z.string(),
  wallClockMs: z.number().min(0),
  failureCategory: z.string().nullable().optional(),
  failureDetail: z.string().nullable().optional(),
  userMessage: z.string().optional(),
  assistantText: z.string().optional(),
  scenePhase: z
    .object({
      expected: z.enum(PHASES).nullable(),
      detected: z.enum(PHASES).nullable(),
      violatedMonotonicity: z.boolean(),
    })
    .optional(),
  imageUrls: z.array(z.string()).optional(),
  qualityCheck: qualityCheckResultSchema.optional(),
  timings: turnTimingSchema.optional(),
  failures: z.array(turnFailureSchema).optional(),
  judgeVerdicts: judgeVerdictSetSchema.optional(),
});
export type TurnResult = z.infer<typeof turnResultSchema>;

export const scenarioManifestSchema = z.object({
  scenarioId: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(MANIFEST_STATUSES),
  turns: z.array(turnManifestSchema),
  rubricScore: rubricScoreSchema.nullable(),
  artifactsDir: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  terminationReason: z.string().nullable().optional(),
  judgeVerdicts: judgeVerdictSetSchema.optional(),
});
export type ScenarioManifest = z.infer<typeof scenarioManifestSchema>;

export const scenarioResultSchema = z.object({
  scenarioId: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().nullable().optional(),
  status: z.enum(SCENARIO_STATUSES),
  turns: z.array(turnResultSchema),
  rubricScore: rubricScoreSchema.nullable().optional(),
  artifactsDir: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  characterSlug: z.string().optional(),
  completedAt: z.string().nullable().optional(),
  terminationReason: z.string().nullable().optional(),
  imageResults: z.array(imageResultSchema).optional(),
  rubric: rubricScoreSchema.nullable().optional(),
  provisional: z.boolean().optional(),
  failureCategory: z.string().nullable().optional(),
  judgeVerdicts: judgeVerdictSetSchema.optional(),
});
export type ScenarioResult = z.infer<typeof scenarioResultSchema>;

const hasLegacyTurnFields = (
  turn: TurnManifest | TurnResult,
): turn is TurnManifest & { scenePhase: NonNullable<TurnManifest["scenePhase"]> } =>
  "scenePhase" in turn &&
  turn.scenePhase !== undefined &&
  "qualityCheck" in turn &&
  turn.qualityCheck !== undefined &&
  "timings" in turn &&
  turn.timings !== undefined;

export const runManifestSchema = z.object({
  runId: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().nullable().optional(),
  status: z.enum(RUN_STATUSES),
  scenarios: z.array(scenarioResultSchema),
  rubricScore: rubricScoreSchema.nullable().optional(),
  artifactsDir: z.string().min(1).optional(),
  completedAt: z.string().nullable().optional(),
  node: z.string().optional(),
  playwright: z.string().optional(),
  chrome: z.string().optional(),
  cdpPort: z.number().int().optional(),
  configuredModel: z.string().optional(),
  terminationReason: z.string().nullable().optional(),
});
export type RunManifest = z.infer<typeof runManifestSchema>;

export const normalizeTurnManifest = (turn: TurnManifest): TurnManifest => ({
  ...turn,
  scenePhase: {
    expected: turn.scenePhase.expected,
    detected: turn.scenePhase.detected,
    violatedMonotonicity: turn.scenePhase.violatedMonotonicity,
  },
  qualityCheck: {
    passed: turn.qualityCheck.passed,
    failedCheck: turn.qualityCheck.failedCheck,
    retries: turn.qualityCheck.retries,
    details: turn.qualityCheck.details,
  },
  timings: {
    firstTokenMs: turn.timings.firstTokenMs,
    lastChunkMs: turn.timings.lastChunkMs,
    wallClockMs: turn.timings.wallClockMs,
  },
});

export const normalizeScenarioManifest = (
  scenario: ScenarioManifest | ScenarioResult,
): ScenarioResult => {
  const turns: TurnResult[] = scenario.turns.map((turn) =>
    hasLegacyTurnFields(turn)
      ? {
          turnIndex: turn.turnIndex,
          userMsg: turn.userMessage,
          assistantMsg: turn.assistantText,
          expectedPhase: turn.scenePhase.expected ?? "conversation",
          detectedPhase: turn.scenePhase.detected,
          phaseMonotonicViolation: turn.scenePhase.violatedMonotonicity,
          usedModel: null,
          qualityRetries: turn.qualityCheck.retries,
          failedCheck: turn.qualityCheck.failedCheck,
          renderedMessageCount: 0,
          persistedMessageCount: 0,
          // D1 barrier は v2 P0d 以降の optional metadata として保持する
          d1BarrierSettled: undefined,
          d1BarrierElapsedMs: undefined,
          d1BarrierLastCount: undefined,
          d1BarrierTimeout: undefined,
          firstTokenMs: turn.timings.firstTokenMs,
          lastChunkMs: turn.timings.lastChunkMs,
          hasDoneSignal: false,
          screenshotPath: "",
          wallClockMs: turn.timings.wallClockMs,
          failureCategory: null,
          failureDetail: null,
          userMessage: turn.userMessage,
          assistantText: turn.assistantText,
          scenePhase: turn.scenePhase,
          imageUrls: turn.imageUrls,
          qualityCheck: turn.qualityCheck,
          timings: turn.timings,
          failures: turn.failures,
          judgeVerdicts: turn.judgeVerdicts,
        }
      : turn,
  );
  const rubricScore =
    "rubricScore" in scenario && scenario.rubricScore !== undefined
      ? scenario.rubricScore
      : "rubric" in scenario
        ? scenario.rubric
        : null;
  const finishedAt =
    scenario.finishedAt ?? ("completedAt" in scenario ? scenario.completedAt : null) ?? null;

  return {
    ...scenario,
    turns,
    finishedAt,
    completedAt: finishedAt,
    rubricScore,
    rubric: rubricScore ?? null,
    imageResults: "imageResults" in scenario ? (scenario.imageResults ?? []) : [],
    provisional: "provisional" in scenario ? (scenario.provisional ?? true) : true,
    artifactsDir: scenario.artifactsDir,
    judgeVerdicts: "judgeVerdicts" in scenario ? scenario.judgeVerdicts : undefined,
  };
};

export const normalizeRunManifest = (manifest: RunManifest): RunManifest => {
  const scenarios = manifest.scenarios.map(normalizeScenarioManifest);
  const rubricScore = manifest.rubricScore ?? null;
  const finishedAt = manifest.finishedAt ?? manifest.completedAt ?? null;

  return {
    ...manifest,
    scenarios,
    finishedAt,
    completedAt: finishedAt,
    rubricScore,
  };
};

export type PreflightCheckResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  elapsedMs: number;
};

export type PreflightReport = {
  runId: string;
  startedAt: string;
  completedAt: string;
  allPassed: boolean;
  checks: PreflightCheckResult[];
};
