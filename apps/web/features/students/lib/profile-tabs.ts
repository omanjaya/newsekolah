export const STUDENT_PROFILE_TABS = [
  "overview",
  "attendance",
  "grades",
  "permits",
  "discipline",
  "counseling",
  "library",
  "guardians",
] as const;

export type StudentProfileTab = (typeof STUDENT_PROFILE_TABS)[number];

/**
 * Permission codes that unlock each tab, matching the `x-permission` of the
 * endpoint(s) the tab reads (openapi/modules/*.yaml). A tab opens when the
 * reader holds any one code of its list; the endpoints stay the real
 * authority, this only keeps a reader from seeing a tab that would 403.
 */
export const STUDENT_PROFILE_TAB_PERMISSIONS: Record<StudentProfileTab, readonly string[]> = {
  // Risk signals (view_early_warning) and this month's snapshot (view_mentoring).
  overview: ["view_early_warning", "view_mentoring"],
  // GET /v1/attendance/reports/monthly
  attendance: ["view_reports"],
  // GET /v1/mentoring/students/{id}/snapshot (published grades)
  grades: ["view_mentoring"],
  // GET /v1/leave-requests/review-queue
  permits: ["review_leave_requests"],
  // GET /v1/discipline/students/{id}
  discipline: ["view_discipline"],
  // GET /v1/discipline/students/{id}/counselings
  counseling: ["manage_counseling"],
  // GET /v1/library/members/{id}
  library: ["manage_library_members"],
  // GET /v1/users/{id} (father, mother, guardian)
  guardians: ["view_users"],
};

/** The tabs a reader may see, in display order. */
export function visibleStudentProfileTabs(
  can: (permission: string) => boolean,
): StudentProfileTab[] {
  return STUDENT_PROFILE_TABS.filter((tab) =>
    STUDENT_PROFILE_TAB_PERMISSIONS[tab].some((permission) => can(permission)),
  );
}
