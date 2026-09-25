import type { NavItem, NavProfileKind } from "./navigation";

/** Choose two daily destinations from the already authorized registry. */
export function mobileNavigation(items: NavItem[], profile?: NavProfileKind): NavItem[] {
  // A counselor (guru BK) is seeded with the "teacher" profile kind like any
  // other teacher, but their counselor duty (docs/07-ui-ux.md section 1's
  // Guru BK persona: "Antrean izin, SP, konseling") rarely comes with a teaching
  // assignment, so attendance/schedule are usually empty for them. The
  // registry only grants the "counseling" item via manage_counseling, which
  // ordinary teachers never hold, so its presence is a safe proxy -- no new
  // signal needs to be threaded through from the caller.
  const isCounselor = items.some((item) => item.key === "counseling");
  const priorities =
    profile === "teacher"
      ? isCounselor
        ? ["leave-requests", "counseling"]
        : ["attendance", "schedule"]
      : profile === "student"
        ? // Scanning into class happens every single lesson, several
          // times a day; an exit permit is occasional. The daily tab bar
          // has room for two, so classroom entry earns the slot exit
          // permits held before (exit permits stays reachable from Menu).
          ["schedule", "classroom-entry"]
        : // Admin, office/TU staff, and gate duty (satpam) all seed with
          // `profile_kind: "staff"` (or no profile row at all for a
          // bootstrap admin), with no further persona signal threaded
          // through from the caller, so this ranks candidates by how
          // permission-specific they are instead of guessing which one the
          // reader is: "school-users"/"schedule" only ever show up for an
          // admin (view_users, view_schedules); "exit-permits"/
          // "visitors-board" are the front-desk/gate duty's daily pair
          // (issue_scan_tokens or scan_exit_permits, and view_visitors --
          // most other staff accounts, ranked below the admin-only pair);
          // the rest is the generic fallback for every other staff account
          // (e.g. a librarian, who only has "library-desk") -- see
          // docs/analysis/ux-audit-2026-09-25.md finding 8.
          [
            "school-users",
            "schedule",
            "exit-permits",
            "visitors-board",
            "duty",
            "library-desk",
            "school-classes",
            "attendance",
          ];
  const daily = priorities
    .flatMap((key) => {
      const item = items.find((entry) => entry.key === key);
      return item ? [item] : [];
    })
    .slice(0, 2);
  return [
    items.find((item) => item.key === "dashboard"),
    ...daily,
    items.find((item) => item.key === "profile"),
  ].filter((item): item is NavItem => Boolean(item));
}
