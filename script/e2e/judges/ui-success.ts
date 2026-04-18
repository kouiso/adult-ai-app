import type { JudgeVerdict } from "../types";

export type UiSuccessInput = {
  renderedMessageCount: number;
  previousCount: number;
  hasDoneSignal: boolean;
  firstTokenMs: number | null;
};

export function judgeUiSuccess(input: UiSuccessInput): JudgeVerdict {
  const expectedCount = input.previousCount + 2;

  if (input.renderedMessageCount < expectedCount) {
    return {
      pass: false,
      reason: `renderedMessageCount ${input.renderedMessageCount} < expected ${expectedCount}`,
    };
  }

  if (!input.hasDoneSignal) {
    return {
      pass: false,
      reason: "stream done signal missing",
    };
  }

  if (input.firstTokenMs === null) {
    return {
      pass: false,
      reason: "first token timing missing",
    };
  }

  return { pass: true, reason: null };
}

export function runUISuccessJudge(input: UiSuccessInput): JudgeVerdict {
  return judgeUiSuccess(input);
}
