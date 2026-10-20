import { describe, expect, it } from "vitest";

import { availableQuickActions, quickActionHref, quickActions } from "./quick-actions";

const ids = (actions: { id: string }[]) => actions.map((action) => action.id);

function granting(...codes: string[]) {
  return (permission: string) => codes.includes(permission);
}

describe("availableQuickActions", () => {
  it("offers only the ungated actions to a reader with no permissions", () => {
    expect(ids(availableQuickActions(granting(), "teacher"))).toEqual(["check-in", "scan-qr"]);
  });

  it("offers a student the leave and scan actions, not staff-only ones", () => {
    const actions = availableQuickActions(granting("submit_leave_requests"), "student");
    expect(ids(actions)).toEqual(["submit-leave", "scan-qr"]);
  });

  it("requires both the action permission and access to the target screen", () => {
    // record_violations alone cannot open the ledger page (view_discipline).
    expect(ids(availableQuickActions(granting("record_violations"), "teacher"))).not.toContain(
      "record-violation",
    );
    expect(
      ids(availableQuickActions(granting("record_violations", "view_discipline"), "teacher")),
    ).toContain("record-violation");
  });

  it("gates each action on its own permission", () => {
    const cases: [string, string[], string][] = [
      ["show-duty-qr", ["issue_scan_tokens"], "/duty"],
      ["add-visitor", ["manage_visitors", "view_visitors"], "/visitors/board"],
      ["lend-book", ["manage_library_circulation"], "/library/desk"],
    ];
    for (const [id, codes] of cases) {
      expect(ids(availableQuickActions(granting(...codes), "staff"))).toContain(id);
      expect(ids(availableQuickActions(granting(), "staff"))).not.toContain(id);
    }
  });

  it("hides the check-in action from students and keeps it for staff", () => {
    expect(ids(availableQuickActions(granting(), "student"))).not.toContain("check-in");
    expect(ids(availableQuickActions(granting(), "staff"))).toContain("check-in");
  });

  it("returns every action for a reader holding every permission", () => {
    const all = granting(
      "record_violations",
      "view_discipline",
      "submit_leave_requests",
      "issue_scan_tokens",
      "manage_visitors",
      "view_visitors",
      "manage_library_circulation",
      "view_library",
    );
    expect(ids(availableQuickActions(all, "teacher"))).toEqual(ids([...quickActions]));
  });
});

describe("quickActionHref", () => {
  it("appends the starting query parameters", () => {
    const leave = quickActions.find((action) => action.id === "submit-leave");
    expect(leave && quickActionHref(leave)).toBe(
      "/leave-requests?type=leave&tab=mine&quick=submit-leave",
    );
  });

  it("returns the bare path when no state is needed", () => {
    const duty = quickActions.find((action) => action.id === "show-duty-qr");
    expect(duty && quickActionHref(duty)).toBe("/duty");
  });
});
