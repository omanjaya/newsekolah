import { shiftDayKey } from "../../../lib/group-by-day";
import type { LibraryMember, LibraryMemberStatus } from "../members-api";

/**
 * A suspension still running today, whatever the membership's validity:
 * `until` is its last day and `borrowFrom` the day after. Both are null
 * for one with no end date (it lasts until staff lift it). When the
 * membership itself ends before `borrowFrom` (`membershipEnds`, its last
 * valid day, which may already have passed), no day is promised:
 * `borrowFrom` is null, as the member could not borrow then either.
 */
export type RunningSuspension =
  | { until: string; borrowFrom: string; membershipEnds: null }
  | { until: string; borrowFrom: null; membershipEnds: string }
  | { until: null; borrowFrom: null; membershipEnds: null };

/**
 * Why a member cannot borrow today, from their membership alone:
 * - suspended: a suspension still running (RunningSuspension),
 * - expired: the membership's validity ended on `until`; this comes first,
 *   even during a suspension, since renewing it is what the member needs,
 * - inactive: the membership is pending, inactive or cleared.
 *
 * Staff screens that must name a suspension even once the membership has
 * also expired read runningSuspension beside this.
 */
export type MemberBorrowBlock =
  | ({ kind: "suspended" } & RunningSuspension)
  | { kind: "expired"; until: string }
  | { kind: "inactive" };

type MembershipFields = Pick<LibraryMember, "status" | "suspended_until" | "valid_until">;

/** "YYYY-MM-DD" of a date field, or null when it is unset. */
function dayOf(value: string | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

/**
 * The membership half of the borrowing rule, mirroring the server's
 * domain.Member.EligibleToBorrow (apps/api/internal/modules/library/domain/members.go)
 * so every screen says what the desk would answer: a suspension blocks
 * through its last day and is over the day after, and a membership is
 * valid through its valid_until day. `today` and the dates are
 * "YYYY-MM-DD" calendar days, compared as text. Null when the membership
 * itself allows borrowing; loan limits and fines are separate.
 */
export function memberBorrowBlock(
  member: MembershipFields,
  today: string,
): MemberBorrowBlock | null {
  const validUntil = dayOf(member.valid_until);
  const expired = validUntil !== null && today > validUntil ? validUntil : null;
  switch (member.status) {
    case "active":
      return expired ? { kind: "expired", until: expired } : null;
    case "suspended": {
      if (expired) return { kind: "expired", until: expired };
      const running = runningSuspension(member, today);
      return running ? { kind: "suspended", ...running } : null;
    }
    default:
      return { kind: "inactive" };
  }
}

/**
 * The member's suspension still running on `today`, or null when there is
 * none: the status is suspended and its last day (if any) has not passed.
 * Unlike memberBorrowBlock this ignores whether the membership has also
 * expired, so the staff screens keep naming a suspension the server still
 * refuses a loan for (EligibleToBorrow checks the suspension first) after
 * the membership is renewed.
 */
export function runningSuspension(
  member: MembershipFields,
  today: string,
): RunningSuspension | null {
  if (member.status !== "suspended") return null;
  const until = dayOf(member.suspended_until);
  if (until === null) return { until: null, borrowFrom: null, membershipEnds: null };
  // Over the day after its last day.
  if (today > until) return null;
  const borrowFrom = shiftDayKey(until, 1);
  const validUntil = dayOf(member.valid_until);
  if (validUntil !== null && validUntil < borrowFrom) {
    return { until, borrowFrom: null, membershipEnds: validUntil };
  }
  return { until, borrowFrom, membershipEnds: null };
}

/**
 * The status to show for `member` on `today`: a suspension whose last day
 * has passed reads active, as the server lends to (and stores) it. The
 * API already ends such a suspension before it answers; this only keeps a
 * page left open across midnight from showing it as running.
 */
export function shownMemberStatus(
  member: Pick<LibraryMember, "status" | "suspended_until">,
  today: string,
): LibraryMemberStatus {
  const until = dayOf(member.suspended_until);
  if (member.status === "suspended" && until !== null && today > until) return "active";
  return member.status;
}
