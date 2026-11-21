import type { ScheduleHold } from "./api";

/** Which sentence names a hold: its kind, and for a request its status. */
export type HoldKey = "attendance" | "supervision" | "substitutionPending" | "substitutionAccepted";

/** The page a hold can be looked at on. */
export type HoldPage = "substitutions" | "attendance";

/** What a hold's link opens, and the message key of its label. */
export interface HoldLink {
  href: string;
  page: HoldPage;
  key: "openSubstitutions" | "openAttendance";
}

/** The sentence that names a hold, by its kind (and a request's status). */
export function holdKey(hold: ScheduleHold): HoldKey {
  if (hold.kind !== "substitution") return hold.kind;
  return hold.status === "accepted" ? "substitutionAccepted" : "substitutionPending";
}

/**
 * Where a hold can be looked at: a request on the school-wide substitutions
 * list, where a schedule manager can cancel it, and a recorded session on
 * its own page (the hold's id is the session's). That day's attendance
 * page opens on the school's day for a manager with no teacher picked, and
 * for a date ahead says nothing is recorded yet, so it never showed the
 * session that holds the date. A supervision visit has no page of its own
 * here.
 */
export function holdLink(hold: ScheduleHold): HoldLink | undefined {
  if (hold.kind === "substitution") {
    return { href: "/substitutions?view=all", page: "substitutions", key: "openSubstitutions" };
  }
  if (hold.kind === "attendance") {
    return {
      href: `/attendance/${encodeURIComponent(hold.id)}`,
      page: "attendance",
      key: "openAttendance",
    };
  }
  return undefined;
}
