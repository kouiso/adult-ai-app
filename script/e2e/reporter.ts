import { FAILURE_CATEGORIES, type FailureCategory } from "./failure-taxonomy";
import {
  getAfterglowTailHitCount,
  getAfterglowTailWindowSize,
  getAfterglowOutcomeStatus,
  getCreampieOutcomeStatus,
} from "./judges/outcome-detection";
import { scoreScenario } from "./judges/rubric";
import { atomicWriteText, getPaths } from "./manifest";
import { type RubricScore, type RunManifest, type ScenarioResult, type TurnResult } from "./types";

export type SummaryOptions = { allowFinal: boolean };

type ModelDrift = {
  scenarioId: string;
  turnIndex: number;
  configured: string;
  used: string;
};

type ScoreEntry = {
  label: string;
  deduction: number;
  reason: string;
};

const pad = (value: string, width: number): string => value.padEnd(width, " ");

const maxWidth = (values: string[]): number =>
  values.reduce((largest, value) => Math.max(largest, value.length), 0);

const formatBoolean = (value: boolean): string => (value ? "yes" : "no");

const formatScore = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const creampieStatus = (scenario: ScenarioResult): string => getCreampieOutcomeStatus(scenario);

const afterglowStatus = (scenario: ScenarioResult): string => getAfterglowOutcomeStatus(scenario);

const imageStagesStatus = (scenario: ScenarioResult): string => {
  if (scenario.imageResults.length === 0) return "n/a";
  return scenario.imageResults.every(
    (image) => image.novitaUrlReceived && image.r2KeyPersisted && image.reloadDisplayed,
  )
    ? "yes"
    : "no";
};

const reviewedImageCount = (scenario: ScenarioResult): number =>
  scenario.imageResults.filter(
    (image) => image.reviewerSignature !== null && image.reviewerNotes !== null,
  ).length;

const provisionalReasons = (manifest: RunManifest, opts: SummaryOptions): string[] => {
  const reasons: string[] = [];
  if (!opts.allowFinal) {
    reasons.push("finalization is blocked because image reviewer sign-off is incomplete");
  }

  const provisionalScenarioIds = manifest.scenarios
    .filter((scenario) => scenario.provisional)
    .map((scenario) => scenario.scenarioId);

  if (provisionalScenarioIds.length > 0) {
    reasons.push(`scenario provisional flags remain: ${provisionalScenarioIds.join(", ")}`);
  }

  return reasons;
};

const isFinalSummary = (manifest: RunManifest, opts: SummaryOptions): boolean =>
  opts.allowFinal && manifest.scenarios.every((scenario) => !scenario.provisional);

const buildMarkdownTable = (headers: string[], rows: string[][]): string => {
  const header = `| ${headers.join(" | ")} |`;
  const separator = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [header, separator, body].filter((line) => line.length > 0).join("\n");
};

const buildScenarioTable = (manifest: RunManifest, scores: Record<string, RubricScore>): string => {
  const rows = manifest.scenarios.map((scenario) => [
    scenario.scenarioId,
    scenario.status,
    String(scenario.turns.length),
    creampieStatus(scenario),
    afterglowStatus(scenario),
    imageStagesStatus(scenario),
    formatScore(scores[scenario.scenarioId]?.eventWeightedTotal ?? 0),
  ]);

  return buildMarkdownTable(
    [
      "scenarioId",
      "status",
      "turns",
      "creampie ok",
      "afterglow ok",
      "image stages ok",
      "rubric eventWeighted",
    ],
    rows,
  );
};

const buildFailureTable = (counts: Record<FailureCategory, number>): string => {
  const rows = FAILURE_CATEGORIES.map((category) => [category, String(counts[category])]);
  return buildMarkdownTable(["failureCategory", "count"], rows);
};

const buildModelDriftTable = (drift: ModelDrift[]): string => {
  if (drift.length === 0) {
    return "No model drift detected.";
  }

  const rows = drift.map((entry) => [
    entry.scenarioId,
    `T${entry.turnIndex}`,
    entry.configured,
    entry.used,
  ]);
  return buildMarkdownTable(["scenarioId", "turn", "configured", "used"], rows);
};

const buildImageReviewTable = (manifest: RunManifest, finalSummary: boolean): string => {
  const headers = finalSummary
    ? ["scenarioId", "reviewed/total"]
    : ["scenarioId", "reviewed/total", "provisional"];

  const rows = manifest.scenarios.map((scenario) => {
    const base = [
      scenario.scenarioId,
      `${reviewedImageCount(scenario)}/${scenario.imageResults.length}`,
    ];
    return finalSummary ? base : [...base, formatBoolean(scenario.provisional)];
  });

  return buildMarkdownTable(headers, rows);
};

const scoreEntriesForScenario = (scenario: ScenarioResult, score: RubricScore): ScoreEntry[] => {
  const entries: ScoreEntry[] = [
    {
      label: "sceneAlignment",
      deduction: Math.max(0, 25 - score.sceneAlignment),
      reason: `${scenario.turns.filter((turn) => turn.detectedPhase === turn.expectedPhase).length}/${scenario.turns.length} turns matched expected phase`,
    },
    {
      label: "eroticDensity",
      deduction: Math.max(0, 25 - score.eroticDensity),
      reason: `${scenario.turns.filter((turn) => turn.detectedPhase === "erotic" || turn.detectedPhase === "climax").length}/${scenario.turns.length} turns reached erotic or climax phase`,
    },
    {
      label: "characterConsistency",
      deduction: Math.max(0, 20 - score.characterConsistency),
      reason: `${scenario.turns.filter((turn) => turn.failedCheck === "wrong-first-person" || turn.failedCheck === "english_drift").length} identity drift checks failed`,
    },
    {
      label: "escalationNaturalness",
      deduction: Math.max(0, 15 - score.escalationNaturalness),
      reason: `${scenario.turns.filter((turn) => turn.phaseMonotonicViolation).length} monotonic phase violations detected`,
    },
    {
      label: "noMetaRemarks",
      deduction: Math.max(0, 15 - score.noMetaRemarks),
      reason: `${scenario.turns.filter((turn) => turn.failedCheck === "meta_remark").length} meta remark checks failed`,
    },
    {
      label: "bonus.creampie",
      deduction: Math.max(0, 10 - score.bonuses.creampie),
      reason:
        creampieStatus(scenario) === "n/a"
          ? "no creampie requirement in this scenario"
          : `creampie outcome status: ${creampieStatus(scenario)}`,
    },
    {
      label: "bonus.afterglow",
      deduction: Math.max(0, 10 - score.bonuses.afterglow),
      reason:
        afterglowStatus(scenario) === "n/a"
          ? "no afterglow requirement in this scenario"
          : `afterglow outcome status: ${afterglowStatus(scenario)} (${getAfterglowTailHitCount(scenario)}/${getAfterglowTailWindowSize(scenario)} tail hits)`,
    },
    {
      label: "bonus.image",
      deduction: Math.max(0, 15 - score.bonuses.image),
      reason:
        scenario.imageResults.length === 0
          ? "no image stage in this scenario"
          : `image pipeline status: ${imageStagesStatus(scenario)}, reviewed ${reviewedImageCount(scenario)}/${scenario.imageResults.length}`,
    },
  ];

  return entries.sort((left, right) => right.deduction - left.deduction);
};

const buildTopRubricDeductions = (
  manifest: RunManifest,
  scores: Record<string, RubricScore>,
): string => {
  const sections = manifest.scenarios.map((scenario) => {
    const score = scores[scenario.scenarioId];
    const top = scoreEntriesForScenario(scenario, score).slice(0, 3);
    const lines = top.map(
      (entry) => `- ${entry.label}: -${formatScore(entry.deduction)} (${entry.reason})`,
    );
    return [`### ${scenario.scenarioId}`, ...lines].join("\n");
  });

  return sections.join("\n\n");
};

export function buildFailureCounts(manifest: RunManifest): Record<FailureCategory, number> {
  const counts: Record<FailureCategory, number> = {
    "env.service_down": 0,
    "env.network": 0,
    "upstream.model_down": 0,
    "upstream.rate_limit": 0,
    "upstream.content_filter": 0,
    "app.quality_exhausted": 0,
    "app.streaming_stall": 0,
    "app.persistence": 0,
    "test.flaky": 0,
  };

  for (const scenario of manifest.scenarios) {
    for (const turn of scenario.turns) {
      if (turn.failureCategory !== null) {
        counts[turn.failureCategory] += 1;
      }
    }
  }

  return counts;
}

export function buildPhaseTimeline(scenario: ScenarioResult): string {
  const rows = scenario.turns.map((turn) => ({
    turn: `T${turn.turnIndex}`,
    expected: turn.expectedPhase,
    detected: turn.detectedPhase ?? "-",
    monotonic: turn.phaseMonotonicViolation ? "✗" : "✓",
    match: turn.detectedPhase === turn.expectedPhase ? "✓" : "✗",
  }));

  const turnWidth = maxWidth(["Turn", ...rows.map((row) => row.turn)]);
  const expectedWidth = maxWidth(["Expected", ...rows.map((row) => row.expected)]);
  const detectedWidth = maxWidth(["Detected", ...rows.map((row) => row.detected)]);
  const monotonicWidth = maxWidth(["Monotonic", ...rows.map((row) => row.monotonic)]);
  const matchWidth = maxWidth(["Match", ...rows.map((row) => row.match)]);

  const header = [
    pad("Turn", turnWidth),
    pad("Expected", expectedWidth),
    pad("Detected", detectedWidth),
    pad("Monotonic", monotonicWidth),
    pad("Match", matchWidth),
  ].join(" | ");

  const divider = [
    "-".repeat(turnWidth),
    "-".repeat(expectedWidth),
    "-".repeat(detectedWidth),
    "-".repeat(monotonicWidth),
    "-".repeat(matchWidth),
  ].join("-|-");

  const body = rows.map((row) =>
    [
      pad(row.turn, turnWidth),
      pad(row.expected, expectedWidth),
      pad(row.detected, detectedWidth),
      pad(row.monotonic, monotonicWidth),
      pad(row.match, matchWidth),
    ].join(" | "),
  );

  return [header, divider, ...body].join("\n");
}

export function buildEventWeightedScore(manifest: RunManifest): Record<string, RubricScore> {
  const scores: Record<string, RubricScore> = {};

  for (const scenario of manifest.scenarios) {
    scores[scenario.scenarioId] = scenario.rubric ?? scoreScenario(scenario, scenario.imageResults);
  }

  return scores;
}

export function detectModelDrift(manifest: RunManifest): ModelDrift[] {
  const drift: ModelDrift[] = [];

  for (const scenario of manifest.scenarios) {
    for (const turn of scenario.turns) {
      if (turn.usedModel !== null && turn.usedModel !== manifest.configuredModel) {
        drift.push({
          scenarioId: scenario.scenarioId,
          turnIndex: turn.turnIndex,
          configured: manifest.configuredModel,
          used: turn.usedModel,
        });
      }
    }
  }

  return drift;
}

export async function writeSummary(
  manifest: RunManifest,
  resultsRoot: string,
  opts: SummaryOptions,
): Promise<string> {
  const scores = buildEventWeightedScore(manifest);
  const failureCounts = buildFailureCounts(manifest);
  const drift = detectModelDrift(manifest);
  const finalSummary = isFinalSummary(manifest, opts);
  const reasons = provisionalReasons(manifest, opts);
  const titleSuffix = finalSummary ? "" : " [unreviewed]";

  const statusSection = finalSummary
    ? "**STATUS: FINAL**"
    : `**STATUS: PROVISIONAL** — ${reasons.join("; ")}`;

  const meta = buildMarkdownTable(
    ["Field", "Value"],
    [
      ["startedAt", manifest.startedAt],
      ["completedAt", manifest.completedAt ?? "-"],
      ["status", manifest.status],
      ["node", manifest.node],
      ["playwright", manifest.playwright],
      ["chrome", manifest.chrome],
      ["cdpPort", String(manifest.cdpPort)],
      ["configuredModel", manifest.configuredModel],
    ],
  );

  const phaseTimelines = manifest.scenarios
    .map(
      (scenario) =>
        `### ${scenario.scenarioId}\n\n\`\`\`text\n${buildPhaseTimeline(scenario)}\n\`\`\``,
    )
    .join("\n\n");

  const sections = [
    `# E2E Run Summary — ${manifest.runId}${titleSuffix}`,
    "## Meta",
    meta,
    "## Scenarios",
    buildScenarioTable(manifest, scores),
    "## Phase Timeline (per scenario)",
    phaseTimelines,
    "## Failure Taxonomy Counts",
    buildFailureTable(failureCounts),
    "## Model Drift",
    buildModelDriftTable(drift),
    "## Image Review Status",
    buildImageReviewTable(manifest, finalSummary),
    "## Top rubric deductions",
    buildTopRubricDeductions(manifest, scores),
    "## Provisional vs Final",
    statusSection,
  ];

  const summary = `${sections.join("\n\n")}\n`;
  const summaryPath = getPaths(resultsRoot, manifest.runId).summaryPath;
  await atomicWriteText(summaryPath, summary);
  return summaryPath;
}
