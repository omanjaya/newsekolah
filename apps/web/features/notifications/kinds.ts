import type { FeatureModule } from "../../lib/modules/feature-modules";

/**
 * Every notification kind the API emits; drives the preferences matrix.
 * Mirrors the `Kind` constants in
 * apps/api/internal/modules/notifications/domain/notification.go.
 */
export const NOTIFICATION_KINDS = [
  "announcement_published",
  "attendance_submitted",
  "substitution_requested",
  "substitution_responded",
  "leave_request_submitted",
  "leave_request_reviewed",
  "leave_request_issued",
  "exit_permit_stage_changed",
  "exit_permit_issued",
  "exit_permit_exited",
  "late_arrival_opened",
  "late_arrival_updated",
  "warning_letter_issued",
  "discipline_threshold_reached",
  "library_reservation_ready",
  "library_loan_due_reminder",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * The feature module that emits each kind; `undefined` for an always-on
 * one. A switched-off module sends nothing, so its kinds are left out of
 * the preference, default and filter lists (the stored preferences are
 * kept and listed again once it is back on).
 */
export const NOTIFICATION_KIND_MODULE: Record<NotificationKind, FeatureModule | undefined> = {
  announcement_published: "announcements",
  attendance_submitted: undefined,
  substitution_requested: undefined,
  substitution_responded: undefined,
  leave_request_submitted: "permits",
  leave_request_reviewed: "permits",
  leave_request_issued: "permits",
  exit_permit_stage_changed: "permits",
  exit_permit_issued: "permits",
  exit_permit_exited: "permits",
  late_arrival_opened: "permits",
  late_arrival_updated: "permits",
  warning_letter_issued: "discipline",
  discipline_threshold_reached: "discipline",
  library_reservation_ready: "library",
  library_loan_due_reminder: "library",
};

/** The kinds a module emits, in list order. */
export function notificationKindsOf(module: FeatureModule): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((kind) => NOTIFICATION_KIND_MODULE[kind] === module);
}

/** The kinds of the modules that are on, in list order. */
export function availableNotificationKinds(
  isEnabled: (module: FeatureModule) => boolean,
): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((kind) => {
    const module = NOTIFICATION_KIND_MODULE[kind];
    return !module || isEnabled(module);
  });
}
