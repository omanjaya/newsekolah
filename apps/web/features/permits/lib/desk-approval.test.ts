import { describe, expect, it } from "vitest";

import {
  acceptsDeskApproval,
  deskApprovalTarget,
  deskRefusal,
  permitAwaitingDeskApproval,
  stageJustApproved,
} from "./desk-approval";

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

describe("deskApprovalTarget", () => {
  it("is ready when a permit waits on the desk", () => {
    const permit = { id: "now", status: "in_progress", current_stage: desk };
    expect(deskApprovalTarget([permit])).toEqual({ kind: "ready", permit });
  });

  it("names the stage a permit past the desk waits on", () => {
    const permit = { id: "now", status: "in_progress", current_stage: counselor };
    expect(deskApprovalTarget([{ id: "old", status: "completed" }, permit])).toEqual({
      kind: "elsewhere",
      permit,
      stage: counselor,
    });
  });

  it("points an approved permit to the gate", () => {
    const permit = { id: "now", status: "approved" };
    expect(deskApprovalTarget([permit])).toEqual({ kind: "awaitingGate", permit });
  });

  it("finds nothing under way when every permit is closed", () => {
    expect(
      deskApprovalTarget([
        { id: "a", status: "completed" },
        { id: "b", status: "rejected", current_stage: desk },
      ]),
    ).toEqual({ kind: "none" });
  });
});

describe("deskRefusal", () => {
  const permit = { id: "now", status: "in_progress" };

  it("sends the student to a QR-scan stage's own QR", () => {
    expect(deskRefusal({ kind: "elsewhere", permit, stage: counselor }, false)).toEqual({
      reason: "scanStage",
      stage: "Guru BK",
    });
  });

  // A manual stage has no QR: its approver decides on their own screen.
  it("tells the student to wait for a stage reviewed without a QR", () => {
    const review = { ...desk, verification: "manual" } as const;
    expect(deskRefusal({ kind: "elsewhere", permit, stage: review }, false)).toEqual({
      reason: "awaitingReview",
      stage: "Guru piket",
    });
    const auto = { ...counselor, verification: "auto" } as const;
    expect(deskRefusal({ kind: "elsewhere", permit, stage: auto }, false)).toEqual({
      reason: "awaitingReview",
      stage: "Guru BK",
    });
  });

  it("points an approved permit to the gate while its lessons last", () => {
    expect(deskRefusal({ kind: "awaitingGate", permit }, false)).toEqual({
      reason: "awaitingGate",
    });
  });

  // The API refuses every further stage and the gate QR once the lessons
  // are over, so neither is advice that can work.
  it("says the permit has ended once its lessons are over", () => {
    expect(deskRefusal({ kind: "awaitingGate", permit }, true)).toEqual({
      reason: "lessonsOver",
    });
    expect(deskRefusal({ kind: "elsewhere", permit, stage: counselor }, true)).toEqual({
      reason: "lessonsOver",
    });
  });

  it("finds no permit under way", () => {
    expect(deskRefusal({ kind: "none" }, false)).toEqual({ reason: "none" });
  });
});

describe("stageJustApproved", () => {
  const stages = [desk, counselor];

  it("is the stage before the current one while the permit is in progress", () => {
    expect(stageJustApproved({ status: "in_progress", current_stage_index: 1, stages })).toBe(desk);
  });

  it("is the last stage once every stage has passed", () => {
    expect(stageJustApproved({ status: "approved", current_stage_index: 1, stages })).toBe(
      counselor,
    );
  });
});
