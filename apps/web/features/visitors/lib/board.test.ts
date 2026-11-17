import { describe, expect, it } from "vitest";

import type { BoardEntry } from "../api";

import { matchesSearch, minutesSince, sortBoardEntries } from "./board";

function entry(id: string, arrivedAt: string, overdue = false): BoardEntry {
  return {
    overdue,
    visit: {
      id,
      full_name: id,
      organization: "",
      host_user_id: "",
      purpose: "",
      id_checked: false,
      id_type: "",
      badge_number: "",
      arrived_at: arrivedAt,
      checked_in_by: "",
      on_campus: true,
    },
  };
}

describe("minutesSince", () => {
  it("counts whole minutes and never goes below zero", () => {
    const now = new Date("2026-11-14T03:45:30Z");
    expect(minutesSince("2026-11-14T03:00:00Z", now)).toBe(45);
    expect(minutesSince("2026-11-14T04:00:00Z", now)).toBe(0);
    expect(minutesSince("not a date", now)).toBe(0);
  });
});

describe("sortBoardEntries", () => {
  it("puts overdue visitors first, then the longest stay", () => {
    const sorted = sortBoardEntries([
      entry("late-arrival", "2026-11-14T05:00:00Z"),
      entry("early-arrival", "2026-11-14T01:00:00Z"),
      entry("yesterday", "2026-11-13T02:00:00Z", true),
    ]);
    expect(sorted.map((item) => item.visit.id)).toEqual([
      "yesterday",
      "early-arrival",
      "late-arrival",
    ]);
  });
});

describe("matchesSearch", () => {
  it("matches any field, ignoring case and surrounding space", () => {
    expect(matchesSearch("  dinas ", "Bu Ayu", "Dinas Pendidikan")).toBe(true);
    expect(matchesSearch("komite", "Bu Ayu", undefined)).toBe(false);
    expect(matchesSearch("", "anything")).toBe(true);
  });
});
