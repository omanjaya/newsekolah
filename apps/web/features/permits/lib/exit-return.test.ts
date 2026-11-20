import { describe, expect, it } from "vitest";

import { exitReturnState, minutesLate } from "./exit-return";

const due = "2027-02-16T04:00:00Z"; // 11.00 in Jakarta

describe("minutesLate", () => {
  it("counts whole minutes past the due time", () => {
    expect(minutesLate(due, new Date("2027-02-16T04:30:59Z"))).toBe(30);
    expect(minutesLate(due, "2027-02-16T04:00:59Z")).toBe(0);
  });

  it("is 0 before the due time", () => {
    expect(minutesLate(due, new Date("2027-02-16T03:45:00Z"))).toBe(0);
  });
});

describe("exitReturnState", () => {
  const out = {
    exited_at: "2027-02-16T02:15:00Z",
    return_required: true,
    expected_return_at: due,
  };

  it("is out and late once the due time has passed", () => {
    expect(exitReturnState(out, new Date("2027-02-16T03:30:00Z"))).toEqual({
      kind: "out",
      due,
      lateMinutes: 0,
    });
    expect(exitReturnState(out, new Date("2027-02-16T04:30:00Z"))).toEqual({
      kind: "out",
      due,
      lateMinutes: 30,
    });
  });

  it("is returned, late by the minutes past the due time", () => {
    const back = { ...out, returned_at: "2027-02-16T04:20:00Z" };
    expect(exitReturnState(back, new Date("2027-02-16T06:00:00Z"))).toEqual({
      kind: "returned",
      at: "2027-02-16T04:20:00Z",
      lateMinutes: 20,
    });
  });

  it("tracks nothing for a student who went home or has not left", () => {
    const now = new Date("2027-02-16T06:00:00Z");
    expect(exitReturnState({ ...out, return_required: false }, now)).toEqual({ kind: "none" });
    expect(exitReturnState({ return_required: true, expected_return_at: due }, now)).toEqual({
      kind: "none",
    });
    expect(exitReturnState({ exited_at: out.exited_at, return_required: true }, now)).toEqual({
      kind: "none",
    });
  });

  it("shows a return with no due time without judging it", () => {
    const imported = {
      exited_at: out.exited_at,
      return_required: true,
      returned_at: "2027-02-16T05:00:00Z",
    };
    expect(exitReturnState(imported, new Date("2027-02-16T06:00:00Z"))).toEqual({
      kind: "returned",
      at: "2027-02-16T05:00:00Z",
      lateMinutes: null,
    });
  });
});
