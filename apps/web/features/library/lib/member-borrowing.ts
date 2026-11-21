import { shiftDayKey } from "../../../lib/group-by-day";
import type { LibraryMember } from "../members-api";

/**
 * Why a member cannot borrow today, from their membership alone:
 * - suspended: a suspension still running; `until` is its last day and
 *   `borrowFrom` the day after, both null for one with no end date (it
 *   lasts until staff lift it),
 * - expired: the membership's validity ended on `until`,
 * - inactive: the membership is pending, inactive or cleared.
 */
export type MemberBorrowBlock =
  | { kind: "suspended"; until: string; borrowFrom: string }
  | { kind: "suspended"; until: null; borrowFrom: null }
  | { kind: "expired"; until: string }
  | { kind: "inactive" };

type MembershipFields = Pick<LibraryMember, "status" | "suspended_until" | "valid_until">;

/**
 * The membership half of the borrowing rule, mirroring the server's
 * domain.Member.EligibleToBorrow (apps/api/internal/modules/library/domain/members.go)
 * so a reader's own page says what the desk would answer: a suspension
 * blocks through its last day and counts as over the day after, and a
 * membership is valid through its valid_until day. `today` and the dates
 * are "YYYY-MM-DD" calendar days, compared as text. Null when the
 * membership itself allows borrowing; loan limits and fines are separate.
 */
export function memberBorrowBlock(
  member: MembershipFields,
  today: string,
): MemberBorrowBlock | null {
  switch (member.status) {
    case "active":
      break;
    case "suspended": {
      if (!member.suspended_until) return { kind: "suspended", until: null, borrowFrom: null };
      const until = member.suspended_until.slice(0, 10);
      if (today <= until) return { kind: "suspended", until, borrowFrom: shiftDayKey(until, 1) };
      break;
    }
    default:
      return { kind: "inactive" };
  }
  const validUntil = member.valid_until ? member.valid_until.slice(0, 10) : null;
  if (validUntil !== null && today > validUntil) return { kind: "expired", until: validUntil };
  return null;
}
