import { describe, expect, it } from "vitest";

import { ATTENDANCE_HREF, currentSessionHref } from "./current-session-href";

const PERIODS = [
  { id: "p1", starts_at: "07:00:00", ends_at: "07:45:00" },
  { id: "p2", starts_at: "07:45:00", ends_at: "08:30:00" },
  { id: "p3", starts_at: "09:00:00", ends_at: "09:45:00" },
];

function session(id: string, start: string, end: string, submitted = false) {
  return {
    id,
    start_period_id: start,
    end_period_id: end,
    submitted_at: submitted ? "2026-11-14T00:10:00Z" : null,
  };
}

/** Minutes since midnight for "HH:MM". */
function at(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

describe("currentSessionHref (the teacher's centre button)", () => {
  it("opens the session running now while it is still unsubmitted", () => {
    const sessions = [session("a", "p1", "p2"), session("b", "p3", "p3")];
    expect(currentSessionHref(sessions, PERIODS, at("07:50"))).toBe("/attendance/a");
  });

  it("skips a running session already submitted and opens the next one", () => {
    const sessions = [session("a", "p1", "p2", true), session("b", "p3", "p3")];
    expect(currentSessionHref(sessions, PERIODS, at("07:50"))).toBe("/attendance/b");
  });

  it("opens the next session between lessons", () => {
    const sessions = [session("a", "p1", "p1", true), session("b", "p3", "p3")];
    expect(currentSessionHref(sessions, PERIODS, at("08:40"))).toBe("/attendance/b");
  });

  it("never offers a lesson handed to a substitute", () => {
    const sessions = [
      { ...session("a", "p1", "p2"), handed_over_to_user_id: "sub" },
      session("b", "p3", "p3"),
    ];
    expect(currentSessionHref(sessions, PERIODS, at("07:50"))).toBe("/attendance/b");
    expect(currentSessionHref(sessions.slice(0, 1), PERIODS, at("07:50"))).toBe(ATTENDANCE_HREF);
  });

  it("falls back to the attendance list when nothing is left today", () => {
    const sessions = [session("a", "p1", "p2", true)];
    expect(currentSessionHref(sessions, PERIODS, at("12:00"))).toBe(ATTENDANCE_HREF);
    expect(currentSessionHref([], PERIODS, at("07:10"))).toBe(ATTENDANCE_HREF);
  });
});
