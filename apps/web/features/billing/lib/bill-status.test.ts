import { describe, expect, it } from "vitest";

import { billDisplayStatus, billStatusToken } from "./bill-status";

describe("billDisplayStatus", () => {
  it("reports a fully paid bill as paid, regardless of due date", () => {
    expect(billDisplayStatus({ status: "paid", due_date: "2026-01-01" }, "2026-06-01")).toBe(
      "paid",
    );
  });

  it("reports a partially paid bill as partial, even past its due date", () => {
    expect(billDisplayStatus({ status: "partial", due_date: "2026-01-01" }, "2026-06-01")).toBe(
      "partial",
    );
  });

  it("reports an unpaid bill past its due date as overdue", () => {
    expect(billDisplayStatus({ status: "unpaid", due_date: "2026-01-01" }, "2026-06-01")).toBe(
      "overdue",
    );
  });

  it("reports an unpaid bill on its due date as overdue (due date has passed by end of day)", () => {
    expect(billDisplayStatus({ status: "unpaid", due_date: "2026-01-01" }, "2026-01-01")).toBe(
      "unpaid",
    );
  });

  it("reports an unpaid bill not yet due as plain unpaid", () => {
    expect(billDisplayStatus({ status: "unpaid", due_date: "2026-12-01" }, "2026-06-01")).toBe(
      "unpaid",
    );
  });
});

describe("billStatusToken", () => {
  it("maps paid/partial/overdue to their attention-grabbing status colours", () => {
    expect(billStatusToken("paid")).toBe("present");
    expect(billStatusToken("partial")).toBe("late");
    expect(billStatusToken("overdue")).toBe("absent");
  });

  it("gives a plain not-yet-due bill no colour token", () => {
    expect(billStatusToken("unpaid")).toBeUndefined();
  });
});
