import { describe, expect, it } from "vitest";

import {
  acceptsDeskApproval,
  deskApprovalTarget,
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
    expect(
      deskApprovalTarget([
        { id: "old", status: "completed" },
        { id: "now", status: "in_progress", current_stage: counselor },
      ]),
    ).toEqual({ kind: "elsewhere", stage: counselor });
  });

  it("points an approved permit to the gate", () => {
    expect(deskApprovalTarget([{ id: "now", status: "approved" }])).toEqual({
      kind: "awaitingGate",
    });
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
