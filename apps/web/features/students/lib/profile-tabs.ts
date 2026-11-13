import type { FeatureModule } from "../../../lib/modules/feature-modules";

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

/**
 * The feature module whose endpoint a tab-unlocking permission reads. A
 * permission only counts while that module is on, so a school without
 * mentoring, permits, discipline or library loses exactly those tabs.
 */
export const STUDENT_PROFILE_PERMISSION_MODULES: Readonly<Record<string, FeatureModule>> = {
  view_mentoring: "mentoring",
  review_leave_requests: "permits",
  view_discipline: "discipline",
  manage_counseling: "discipline",
  manage_library_members: "library",
};

/**
 * The module whose data a tab shows when that differs from the module its
 * permission reads: the grades tab reads published grades through the
 * mentoring snapshot, so it needs grading on as well.
 */
export const STUDENT_PROFILE_TAB_MODULES: Readonly<
  Partial<Record<StudentProfileTab, FeatureModule>>
> = {
  grades: "grading",
};

/** The tabs a reader may see, in display order. */
export function visibleStudentProfileTabs(
  can: (permission: string) => boolean,
  disabledModules: readonly string[],
): StudentProfileTab[] {
  const usable = (permission: string): boolean => {
    const module = STUDENT_PROFILE_PERMISSION_MODULES[permission];
    return can(permission) && !(module && disabledModules.includes(module));
  };
  return STUDENT_PROFILE_TABS.filter((tab) => {
    const dataModule = STUDENT_PROFILE_TAB_MODULES[tab];
    if (dataModule && disabledModules.includes(dataModule)) return false;
    return STUDENT_PROFILE_TAB_PERMISSIONS[tab].some(usable);
  });
}
