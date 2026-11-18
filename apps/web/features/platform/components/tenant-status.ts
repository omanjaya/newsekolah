import type { BadgeTone } from "@newsekolah/ui";

import type { PlatformTenant } from "../api";

/** One semantic tone per school status, the same in the table and the detail sheet. */
export const TENANT_STATUS_TONE: Record<PlatformTenant["status"], BadgeTone> = {
  active: "success",
  trial: "info",
  suspended: "danger",
  offboarding: "neutral",
};

export const EDUCATION_LEVELS = ["sd", "smp", "sma", "smk"] as const;

/** Indonesia's three time zones, the ones a school can be in. */
export const SCHOOL_TIME_ZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;

const IDLE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** No sign-in or change for a week, or never: a school worth a call. */
export function isIdle(lastActivityAt: string | undefined, now: number = Date.now()): boolean {
  if (!lastActivityAt) return true;
  return now - new Date(lastActivityAt).getTime() > IDLE_DAYS * DAY_MS;
}
