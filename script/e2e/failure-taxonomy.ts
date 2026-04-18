export const FAILURE_CATEGORIES = [
  "env.service_down",
  "env.network",
  "upstream.model_down",
  "upstream.rate_limit",
  "upstream.content_filter",
  "app.quality_exhausted",
  "app.streaming_stall",
  "app.persistence",
  "test.flaky",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export type FailureContext = {
  phase: string;
  scenarioId: string;
  turnIndex: number;
};

type ClassifiedFailure = {
  category: FailureCategory;
  retryable: boolean;
  message: string;
};

type LegacyClassifyInput = {
  message: string;
  httpStatus?: number | null;
  context?: string;
};

const includeAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const normalizeError = (error: unknown): { message: string; httpStatus: number | null } => {
  if (error instanceof Error) {
    return { message: error.message, httpStatus: null };
  }

  if (isRecord(error)) {
    const message =
      readString(error.message) ??
      readString(error.stderr) ??
      readString(error.stdout) ??
      JSON.stringify(error);
    const httpStatus = readNumber(error.status) ?? readNumber(error.httpStatus);
    return { message, httpStatus };
  }

  return {
    message: typeof error === "string" ? error : String(error),
    httpStatus: null,
  };
};

const categoryRetryable = (category: FailureCategory): boolean => {
  switch (category) {
    case "env.service_down":
    case "env.network":
    case "upstream.model_down":
    case "upstream.rate_limit":
    case "app.streaming_stall":
    case "app.persistence":
    case "test.flaky":
      return true;
    case "upstream.content_filter":
    case "app.quality_exhausted":
      return false;
  }
};

const detectCategory = (message: string, httpStatus: number | null): FailureCategory => {
  const normalized = message.toLowerCase();

  if (httpStatus === 429 || includeAny(normalized, ["rate limit", "too many requests", "quota"])) {
    return "upstream.rate_limit";
  }

  if (
    includeAny(normalized, [
      "content policy",
      "safety system",
      "nsfw",
      "guardrail",
      "moderation",
      "filtered",
    ])
  ) {
    return "upstream.content_filter";
  }

  if (
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504 ||
    includeAny(normalized, ["model down", "model_not_available", "openrouter", "novita 5"])
  ) {
    return "upstream.model_down";
  }

  if (
    includeAny(normalized, [
      "econnrefused",
      "enotfound",
      "socket hang up",
      "network error",
      "fetch failed",
      "connection reset",
      "timed out connecting",
    ])
  ) {
    return "env.network";
  }

  if (
    includeAny(normalized, [
      "service unavailable",
      "task up",
      "wrangler",
      "localhost",
      "vite server",
      "d1 not ready",
      "chrome not reachable",
    ])
  ) {
    return "env.service_down";
  }

  if (
    includeAny(normalized, ["quality guard", "quality_exhausted", "retry exceeded", "failed check"])
  ) {
    return "app.quality_exhausted";
  }

  if (
    includeAny(normalized, [
      "stream stalled",
      "done signal",
      "stream timeout",
      "no chunks",
      "streaming",
      "timed out after",
    ])
  ) {
    return "app.streaming_stall";
  }

  if (includeAny(normalized, ["persist", "dexie", "d1 insert", "r2", "reload image", "storage"])) {
    return "app.persistence";
  }

  return "test.flaky";
};

const formatClassifiedMessage = (
  context: FailureContext,
  message: string,
  category: FailureCategory,
): string =>
  `[${category}] phase=${context.phase} scenario=${context.scenarioId} turn=${context.turnIndex} ${message}`;

export function classifyFailure(error: unknown, context: FailureContext): ClassifiedFailure;
export function classifyFailure(input: LegacyClassifyInput): FailureCategory;
export function classifyFailure(
  errorOrInput: unknown,
  context?: FailureContext,
): ClassifiedFailure | FailureCategory {
  if (context) {
    const normalized = normalizeError(errorOrInput);
    const category = detectCategory(normalized.message, normalized.httpStatus);
    return {
      category,
      retryable: categoryRetryable(category),
      message: formatClassifiedMessage(context, normalized.message, category),
    };
  }

  const legacy =
    isRecord(errorOrInput) && typeof errorOrInput.message === "string"
      ? {
          message: errorOrInput.message,
          httpStatus: readNumber(errorOrInput.httpStatus),
          context: readString(errorOrInput.context) ?? "",
        }
      : normalizeError(errorOrInput);
  const category = detectCategory(legacy.message, legacy.httpStatus);
  return category;
}

export const isRetriable = (category: FailureCategory): boolean => categoryRetryable(category);

export const allFailureCategories = FAILURE_CATEGORIES;
