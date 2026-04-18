export type QualityGuardEvent = {
  turnIndex: number;
  failedCheck: string | null;
  retries: number;
};

export const KNOWN_QUALITY_GUARD_FAILED_CHECKS = [
  "wrong-first-person",
  "meta_remark",
  "no-english",
  "xml-format-missing",
  "user-leak",
  "scene-min-length",
  "within-turn-repetition",
  "max-length-exceeded",
  "inner-missing",
] as const;

const FAILED_CHECK_PATTERN = /failed=([a-z-]+)/;

type BufferedEvent = {
  failedCheck: string | null;
};

export class QualityGuardTracker {
  private readonly buffer = new Map<number, BufferedEvent[]>();

  addConsoleLine(turnIndex: number, line: string): void {
    if (!line.includes("[quality-guard]")) return;

    const failedMatch = line.match(FAILED_CHECK_PATTERN);
    if (!failedMatch) return;

    const failedCheck = failedMatch[1] === "none" ? null : failedMatch[1];
    const events = this.buffer.get(turnIndex) ?? [];
    events.push({ failedCheck });
    this.buffer.set(turnIndex, events);
  }

  consume(turnIndex: number): QualityGuardEvent {
    const events = this.buffer.get(turnIndex) ?? [];
    this.buffer.delete(turnIndex);

    return {
      turnIndex,
      failedCheck: events.at(-1)?.failedCheck ?? null,
      retries: events.length,
    };
  }
}
