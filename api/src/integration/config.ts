import { createHash, randomBytes } from "node:crypto";

/** Read on every call so a rotated env or a test can change them without reloading modules. */
const number = (name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export const config = {
  /** How long the one-time code the applicant hands to JobIt stays redeemable. */
  codeMinutes: () => number("INTEGRATION_CODE_TTL_MINUTES", 30, 1, 24 * 60),
  /** How long a consent lasts when the applicant does not choose. */
  consentDays: () => number("INTEGRATION_CONSENT_DAYS", 30, 1, 90),
  maxConsentDays: () => 90,
  /** How long an applicant has to take an assessment JobIt asked for. */
  assessmentHours: () => number("INTEGRATION_ASSESSMENT_HOURS", 72, 1, 24 * 30),
  credentialDays: () => number("INTEGRATION_CREDENTIAL_DAYS", 365, 1, 3650),
  /** Percentage of correct answers that passes. */
  passScore: () => number("INTEGRATION_PASS_SCORE", 70, 1, 100),
  appUrl: () => (process.env.APP_URL ?? "http://localhost:4321").replace(/\/$/, ""),
};

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 10;
/** Rough minutes a student spends on one exercise; the catalog reports effort from it. */
export const MINUTES_PER_EXERCISE = 2;

/** 32 random bytes, base64url: codes, link ids, credential tokens. Only their sha256 is ever stored. */
export const newToken = (): string => randomBytes(32).toString("base64url");

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export const newId = (): string => crypto.randomUUID();

export const addMs = (date: Date, ms: number): Date => new Date(date.getTime() + ms);
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
