import type { ImageResult, RubricScore, ScenarioResult } from "../types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const countTurnsWithFailedCheck = (
  scenario: ScenarioResult,
  failedChecks: readonly string[],
): number =>
  scenario.turns.filter(
    (turn) => turn.failedCheck !== null && failedChecks.includes(turn.failedCheck),
  ).length;

const isEroticOrClimax = (phase: string | null): boolean =>
  phase === "erotic" || phase === "climax";

const isCreampieTurn = (turn: ScenarioResult["turns"][number]): boolean =>
  /中に出|出して|射精|中出し/.test(turn.userMsg);

const isAfterglowExpectedTurn = (turn: ScenarioResult["turns"][number]): boolean =>
  turn.expectedPhase === "afterglow";

export function scoreScenario(scenario: ScenarioResult, images: ImageResult[]): RubricScore {
  const totalTurns = scenario.turns.length;
  const alignedTurns = scenario.turns.filter(
    (turn) => turn.detectedPhase !== null && turn.detectedPhase === turn.expectedPhase,
  ).length;
  const sceneAlignment = totalTurns === 0 ? 0 : (alignedTurns / totalTurns) * 25;

  const eroticTurns = scenario.turns.filter((turn) => isEroticOrClimax(turn.detectedPhase)).length;
  const eroticRatio = totalTurns === 0 ? 0 : eroticTurns / totalTurns;
  const eroticDensity = eroticRatio >= 0.5 ? 25 : eroticRatio * 50;

  const characterPenalty =
    countTurnsWithFailedCheck(scenario, ["wrong-first-person", "english_drift"]) * 2;
  const characterConsistency = clamp(20 - characterPenalty, 0, 20);

  const monotonicViolations = scenario.turns.filter((turn) => turn.phaseMonotonicViolation).length;
  const escalationNaturalness = clamp(15 - monotonicViolations * 5, 0, 15);

  const metaRemarkCount = countTurnsWithFailedCheck(scenario, ["meta_remark"]);
  const noMetaRemarks = clamp(15 - metaRemarkCount * 5, 0, 15);

  const rawTotal = clamp(
    sceneAlignment + eroticDensity + characterConsistency + escalationNaturalness + noMetaRemarks,
    0,
    100,
  );

  const creampieTurns = scenario.turns.filter(isCreampieTurn);
  const creampie =
    creampieTurns.length === 0
      ? 0
      : creampieTurns.every(
            (turn) => turn.detectedPhase === "climax" && turn.assistantMsg.length > 200,
          )
        ? 10
        : -10;

  const afterglowTurns = scenario.turns.filter(isAfterglowExpectedTurn);
  const afterglow =
    afterglowTurns.length === 0
      ? 0
      : afterglowTurns.every((turn) => turn.detectedPhase === "afterglow")
        ? 10
        : -10;

  const imageReviewed = images.length > 0 && images.every((image) => image.reviewerNotes !== null);
  const image = !imageReviewed
    ? 0
    : images.every(
          (entry) => entry.novitaUrlReceived && entry.r2KeyPersisted && entry.reloadDisplayed,
        )
      ? 15
      : -15;

  return {
    sceneAlignment,
    eroticDensity,
    characterConsistency,
    escalationNaturalness,
    noMetaRemarks,
    bonuses: {
      creampie,
      afterglow,
      image,
    },
    eventWeightedTotal: clamp(rawTotal + creampie + afterglow + image, 0, 140),
    rawTotal,
  };
}
