import { decodeScanPayload } from "@/features/scan/payload";
import {
  deskApprovalTarget,
  deskRefusal,
  permitAwaitingDeskApproval,
} from "@/lib/permits/exit-permit";

const picket = { label: "Guru piket", approver_rule: "any_teacher", verification: "qr_scan" };
const counselor = { label: "Guru BK", approver_rule: "duty:counselor", verification: "qr_scan" };

// The duty desk's approval QR ("sion:approve_stage::<token>") names no
// permit: the scanner approves the student's own exit permit waiting on
// the desk with it.
describe("permitAwaitingDeskApproval", () => {
  it("decodes the desk QR with an empty instance id", () => {
    expect(decodeScanPayload("sion:approve_stage::desk-tok")).toEqual({
      kind: "approve_stage",
      instanceId: "",
      token: "desk-tok",
    });
  });

  it("picks the in-progress permit whose stage any teacher approves by QR", () => {
    const permits = [
      { id: "old", status: "completed", current_stage: picket },
      { id: "now", status: "in_progress", current_stage: picket },
    ];
    expect(permitAwaitingDeskApproval(permits)?.id).toBe("now");
  });

  it("finds none while the permit waits on a stage the desk QR cannot approve", () => {
    const permits = [{ id: "now", status: "in_progress", current_stage: counselor }];
    expect(permitAwaitingDeskApproval(permits)).toBeUndefined();
  });
});

// A scan that approves nothing says why: a permit past the desk is sent
// to the stage it waits on, not told to request a permit it already has.
describe("deskApprovalTarget", () => {
  it("is ready when a permit waits on the desk", () => {
    const target = deskApprovalTarget([
      { id: "now", status: "in_progress", current_stage: picket },
    ]);
    expect(target.kind).toBe("ready");
  });

  it("names the stage a permit past the desk waits on", () => {
    const permit = { id: "now", status: "in_progress", current_stage: counselor };
    expect(deskApprovalTarget([permit])).toEqual({ kind: "elsewhere", permit, stage: counselor });
  });

  it("points an approved permit to the gate", () => {
    const permit = { id: "now", status: "approved" };
    expect(deskApprovalTarget([permit])).toEqual({ kind: "awaitingGate", permit });
  });

  it("finds nothing under way when every permit is closed", () => {
    expect(deskApprovalTarget([{ id: "old", status: "completed" }])).toEqual({ kind: "none" });
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

  // A manual stage has no QR to scan: its approver decides on their own
  // screen, so the student is told to wait rather than to scan.
  it("tells the student to wait for a stage reviewed without a QR", () => {
    const review = { ...picket, verification: "manual" };
    expect(deskRefusal({ kind: "elsewhere", permit, stage: review }, false)).toEqual({
      reason: "awaitingReview",
      stage: "Guru piket",
    });
  });

  it("points an approved permit to the gate while its lessons last", () => {
    expect(deskRefusal({ kind: "awaitingGate", permit }, false)).toEqual({
      reason: "awaitingGate",
    });
  });

  // Once the lessons are over the API refuses every further stage and the
  // gate QR, so neither is advice that can work.
  it("says the permit has ended once its lessons are over", () => {
    expect(deskRefusal({ kind: "awaitingGate", permit }, true)).toEqual({ reason: "lessonsOver" });
    expect(deskRefusal({ kind: "elsewhere", permit, stage: counselor }, true)).toEqual({
      reason: "lessonsOver",
    });
  });

  it("finds no permit under way", () => {
    expect(deskRefusal({ kind: "none" }, false)).toEqual({ reason: "none" });
  });
});
