import type { ScenarioResult, TurnResult } from "../types";

const CREAMPIE_USER_PATTERN = /中に出|出して|射精|中出し/;

const CREAMPIE_ASSISTANT_CUES = [
  "中に出",
  "中出し",
  "注がれ",
  "注ぎ込",
  "注ぐ",
  "溢れ",
  "あふれ",
  "満たされ",
  "精液",
  "射精",
  "どくどく",
] as const;

const AFTERGLOW_TAIL_WINDOW = 5;
const AFTERGLOW_TAIL_HITS_MIN = 2;

const hasCreampieAssistantCue = (assistantMsg: string): boolean =>
  CREAMPIE_ASSISTANT_CUES.some((cue) => assistantMsg.includes(cue));

const isCreampieTurn = (turn: TurnResult): boolean => CREAMPIE_USER_PATTERN.test(turn.userMsg);

export const isCreampieOutcomeTurn = (turn: TurnResult): boolean =>
  isCreampieTurn(turn) &&
  turn.detectedPhase === "climax" &&
  turn.assistantMsg.length > 100 &&
  hasCreampieAssistantCue(turn.assistantMsg);

export const hasCreampieOutcome = (scenario: ScenarioResult): boolean => {
  const turns = scenario.turns.filter(isCreampieTurn);
  if (turns.length === 0) return false;
  return turns.some(isCreampieOutcomeTurn);
};

export const getCreampieOutcomeStatus = (scenario: ScenarioResult): "yes" | "no" | "n/a" => {
  const turns = scenario.turns.filter(isCreampieTurn);
  if (turns.length === 0) return "n/a";
  return hasCreampieOutcome(scenario) ? "yes" : "no";
};

export const getAfterglowTailTurns = (scenario: ScenarioResult): TurnResult[] =>
  scenario.turns.filter((turn) => turn.expectedPhase === "afterglow").slice(-AFTERGLOW_TAIL_WINDOW);

export const getAfterglowTailHitCount = (scenario: ScenarioResult): number =>
  getAfterglowTailTurns(scenario).filter((turn) => turn.detectedPhase === "afterglow").length;

export const getAfterglowTailWindowSize = (scenario: ScenarioResult): number =>
  getAfterglowTailTurns(scenario).length;

export const getAfterglowTailStreak = (scenario: ScenarioResult): number => {
  const afterglowTurns = scenario.turns.filter((turn) => turn.expectedPhase === "afterglow");
  let streak = 0;

  for (let index = afterglowTurns.length - 1; index >= 0; index -= 1) {
    if (afterglowTurns[index]?.detectedPhase === "afterglow") {
      streak += 1;
      continue;
    }
    break;
  }

  return streak;
};

export const hasAfterglowOutcome = (scenario: ScenarioResult): boolean => {
  const tailWindowSize = getAfterglowTailWindowSize(scenario);
  if (tailWindowSize === 0) return false;
  return getAfterglowTailHitCount(scenario) >= AFTERGLOW_TAIL_HITS_MIN;
};

export const getAfterglowOutcomeStatus = (scenario: ScenarioResult): "yes" | "no" | "n/a" => {
  const turns = scenario.turns.filter((turn) => turn.expectedPhase === "afterglow");
  if (turns.length === 0) return "n/a";
  return hasAfterglowOutcome(scenario) ? "yes" : "no";
};
