import type { BadgeTone } from "@newsekolah/ui";

/*
 * One map from each library status to a semantic badge tone, so a copy,
 * a member, a loan, a fine or a hold reads the same colour on every
 * screen (the attendance `status-*` tokens stay with attendance).
 */

export const COPY_STATUS_TONE: Record<string, BadgeTone> = {
  available: "success",
  on_loan: "info",
  reserved: "info",
  processing: "neutral",
  reserve_stack: "neutral",
  in_repair: "warning",
  damaged: "warning",
  lost: "danger",
  donated: "neutral",
  unknown: "neutral",
};

export const MEMBER_STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  pending: "warning",
  inactive: "neutral",
  suspended: "danger",
  cleared: "info",
};

export const LOAN_STATUS_TONE: Record<string, BadgeTone> = {
  active: "info",
  returned: "neutral",
  lost: "danger",
};

export const VIOLATION_STATUS_TONE: Record<string, BadgeTone> = {
  unpaid: "warning",
  paid: "success",
  waived: "neutral",
};

export const RESERVATION_STATUS_TONE: Record<string, BadgeTone> = {
  waiting: "info",
  ready: "success",
  fulfilled: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};

export function toneOf(map: Record<string, BadgeTone>, status: string): BadgeTone {
  return map[status] ?? "neutral";
}
