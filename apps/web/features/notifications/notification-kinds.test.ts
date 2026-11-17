import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_MODULE,
  availableNotificationKinds,
  notificationKindsOf,
} from "./api";

const off =
  (...modules: string[]) =>
  (module: string) =>
    !modules.includes(module);

/**
 * The `Kind` constants of
 * apps/api/internal/modules/notifications/domain/notification.go, copied by
 * hand: a kind added on one side only fails here.
 */
const API_KINDS = [
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
  "announcement_published",
  "library_reservation_ready",
  "library_loan_due_reminder",
];

describe("availableNotificationKinds", () => {
  it("lists every kind while every module is on", () => {
    expect(availableNotificationKinds(off())).toEqual([...NOTIFICATION_KINDS]);
  });

  it("leaves out the permits kinds while permits is off", () => {
    expect(availableNotificationKinds(off("permits"))).toEqual([
      "announcement_published",
      "attendance_submitted",
      "substitution_requested",
      "substitution_responded",
      "warning_letter_issued",
      "discipline_threshold_reached",
      "library_reservation_ready",
      "library_loan_due_reminder",
    ]);
  });

  it("leaves out the announcement kind while announcements is off", () => {
    expect(availableNotificationKinds(off("announcements"))).not.toContain(
      "announcement_published",
    );
  });

  it("leaves out the discipline kinds while discipline is off", () => {
    const kinds = availableNotificationKinds(off("discipline"));
    expect(kinds).not.toContain("warning_letter_issued");
    expect(kinds).not.toContain("discipline_threshold_reached");
    expect(kinds).toContain("attendance_submitted");
    expect(kinds).toContain("library_reservation_ready");
  });

  it("leaves out the library kinds while library is off", () => {
    const kinds = availableNotificationKinds(off("library"));
    expect(kinds).not.toContain("library_reservation_ready");
    expect(kinds).not.toContain("library_loan_due_reminder");
    expect(kinds).toContain("attendance_submitted");
    expect(kinds).toContain("warning_letter_issued");
  });

  it("names the emitting module of every module-owned kind", () => {
    expect(notificationKindsOf("permits")).toHaveLength(8);
    expect(notificationKindsOf("announcements")).toEqual(["announcement_published"]);
    expect(notificationKindsOf("discipline")).toEqual([
      "warning_letter_issued",
      "discipline_threshold_reached",
    ]);
    expect(notificationKindsOf("library")).toEqual([
      "library_reservation_ready",
      "library_loan_due_reminder",
    ]);
    const owned = Object.values(NOTIFICATION_KIND_MODULE).filter(Boolean);
    expect(owned).toHaveLength(13);
  });
});

describe("NOTIFICATION_KINDS", () => {
  it("matches the kinds the API emits", () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual([...API_KINDS].sort());
  });
});
