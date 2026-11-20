import { describe, expect, it } from "vitest";

import { acceptsDeskApproval, permitAwaitingDeskApproval } from "./desk-approval";

const desk = {
  key: "picket",
  label: "Guru piket",
  approver_rule: "any_teacher",
  verification: "qr_scan",
} as const;
const counselor = {
  key: "bk",
  label: "Guru BK",
  approver_rule: "duty:counselor",
  verification: "qr_scan",
} as const;

describe("acceptsDeskApproval", () => {
  it("accepts only an any-teacher QR-scan stage", () => {
    expect(acceptsDeskApproval(desk)).toBe(true);
    expect(acceptsDeskApproval(counselor)).toBe(false);
    expect(acceptsDeskApproval({ ...desk, verification: "manual" })).toBe(false);
    expect(acceptsDeskApproval(undefined)).toBe(false);
  });
});

describe("permitAwaitingDeskApproval", () => {
  it("picks the permit in progress whose current stage takes the desk QR", () => {
    const permits = [
      { id: "old", status: "completed", current_stage: desk },
      { id: "now", status: "in_progress", current_stage: desk },
    ];
    expect(permitAwaitingDeskApproval(permits)?.id).toBe("now");
  });

  it("finds none while the permit waits on a stage the desk QR cannot approve", () => {
    expect(
      permitAwaitingDeskApproval([{ id: "now", status: "in_progress", current_stage: counselor }]),
    ).toBeUndefined();
    const none: { status: string }[] = [];
    expect(permitAwaitingDeskApproval(none)).toBeUndefined();
  });
});
