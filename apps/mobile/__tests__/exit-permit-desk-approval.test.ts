import { decodeScanPayload } from "@/features/scan/payload";
import { permitAwaitingDeskApproval } from "@/lib/permits/exit-permit";

const picket = { approver_rule: "any_teacher", verification: "qr_scan" };
const counselor = { approver_rule: "duty:counselor", verification: "qr_scan" };

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
