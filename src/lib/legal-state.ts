import { z } from "zod/v4";

export const AGE_VERIFICATION_STORAGE_KEY = "age_verified";
export const AGE_VERIFICATION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export const ageVerificationStateSchema = z.object({
  verified: z.literal(true),
  timestamp: z.number().int().nonnegative(),
});

export type AgeVerificationState = z.infer<typeof ageVerificationStateSchema>;

const parseAgeVerificationState = (rawValue: string | null): AgeVerificationState | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    const result = ageVerificationStateSchema.safeParse(parsedValue);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

const readLocalStorage = (key: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    console.warn(`legal-state: localStorage.getItem("${key}") failed`);
    return null;
  }
};

const writeLocalStorage = (key: string, value: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    console.warn(`legal-state: localStorage.setItem("${key}") failed`);
  }
};

export const getAgeVerificationState = (): AgeVerificationState | null =>
  parseAgeVerificationState(readLocalStorage(AGE_VERIFICATION_STORAGE_KEY));

export const isAgeVerified = (now = Date.now()): boolean => {
  const state = getAgeVerificationState();
  if (!state) {
    return false;
  }

  return now - state.timestamp <= AGE_VERIFICATION_MAX_AGE_MS;
};

export const setAgeVerified = (timestamp = Date.now()): void => {
  const nextState = ageVerificationStateSchema.parse({
    verified: true,
    timestamp,
  });
  writeLocalStorage(AGE_VERIFICATION_STORAGE_KEY, JSON.stringify(nextState));
};
