import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_MODULE,
  availableNotificationKinds,
  canReceiveNotificationKind,
} from "./api";

const off =
  (...modules: string[]) =>
  (module: string) =>
    !modules.includes(module);

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
    ]);
  });

  it("leaves out the announcement kind while announcements is off", () => {
    expect(availableNotificationKinds(off("announcements"))).not.toContain(
      "announcement_published",
    );
  });

  it("names the emitting module of every permits and announcements kind", () => {
    const owned = Object.entries(NOTIFICATION_KIND_MODULE).filter(([, module]) => module);
    expect(
      owned.every(([kind, module]) =>
        kind === "announcement_published" ? module === "announcements" : module === "permits",
      ),
    ).toBe(true);
    expect(owned).toHaveLength(9);
  });
});

describe("canReceiveNotificationKind", () => {
  const receivable = (me: Parameters<typeof canReceiveNotificationKind>[1]) =>
    NOTIFICATION_KINDS.filter((kind) => canReceiveNotificationKind(kind, me));

  it("offers a student only announcements and the outcome of their own requests", () => {
    expect(
      receivable({
        profile_kind: "student",
        permissions: ["view_notifications", "submit_leave_requests"],
      }),
    ).toEqual([
      "announcement_published",
      "leave_request_reviewed",
      "leave_request_issued",
      "exit_permit_stage_changed",
      "exit_permit_issued",
      "exit_permit_exited",
      "late_arrival_updated",
    ]);
  });

  it("offers a guard announcements and issued exit permits", () => {
    expect(
      receivable({
        profile_kind: "staff",
        permissions: ["view_notifications", "scan_exit_permits"],
      }),
    ).toEqual(["announcement_published", "exit_permit_issued"]);
  });

  it("offers a librarian announcements alone", () => {
    expect(
      receivable({ profile_kind: "staff", permissions: ["manage_library_circulation"] }),
    ).toEqual(["announcement_published"]);
  });

  it("offers a homeroom teacher the requests of their class and substitutions", () => {
    const kinds = receivable({
      profile_kind: "teacher",
      permissions: ["manage_attendance", "review_leave_requests", "correct_attendance"],
    });
    expect(kinds).toContain("attendance_submitted");
    expect(kinds).toContain("leave_request_submitted");
    expect(kinds).toContain("late_arrival_opened");
    expect(kinds).toContain("substitution_requested");
    expect(kinds).not.toContain("leave_request_issued");
  });
});
