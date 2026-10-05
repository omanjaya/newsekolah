import { describe, expect, it } from "vitest";

import { countMyLibraryTiles } from "./my-library-tiles";

describe("countMyLibraryTiles", () => {
  it("counts active loans and picks the soonest due date among them", () => {
    const counts = countMyLibraryTiles(
      [{ due_on: "2026-10-10" }, { due_on: "2026-10-05" }, { due_on: "2026-10-20" }],
      [],
      "2026-10-01",
    );

    expect(counts.activeLoans).toBe(3);
    expect(counts.nextDueOn).toBe("2026-10-05");
  });

  it("returns null for the next due date when there are no active loans", () => {
    const counts = countMyLibraryTiles([], [], "2026-10-01");

    expect(counts.activeLoans).toBe(0);
    expect(counts.nextDueOn).toBeNull();
  });

  it("counts only loans already past today as overdue", () => {
    const counts = countMyLibraryTiles(
      [{ due_on: "2026-09-20" }, { due_on: "2026-10-01" }, { due_on: "2026-10-15" }],
      [],
      "2026-10-01",
    );

    expect(counts.overdue).toBe(1);
  });

  it("counts waiting and ready reservations but not fulfilled, cancelled, or expired ones", () => {
    const counts = countMyLibraryTiles(
      [],
      [
        { status: "waiting" },
        { status: "ready" },
        { status: "fulfilled" },
        { status: "cancelled" },
        { status: "expired" },
      ],
      "2026-10-01",
    );

    expect(counts.reservations).toBe(2);
  });
});
