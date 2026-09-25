import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as AttendanceApiModule from "../api";

import { AttendanceCalendar } from "./attendance-calendar";

type CalendarDay = AttendanceApiModule.CalendarDay;

const TODAY = "2026-09-25";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: (value: string) => value,
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta", locale: "id" } } }),
}));

let calendarData: CalendarDay[] = [];

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof AttendanceApiModule>("../api");
  return {
    ...actual,
    todayInZone: () => TODAY,
    useMyCalendarQuery: () => ({ data: { data: calendarData }, isLoading: false }),
  };
});

function day(date: string, statusCode: string): CalendarDay {
  return {
    date,
    status_code: statusCode,
    expected_sessions: 3,
    submitted_sessions: 0,
    complete: false,
  };
}

describe("AttendanceCalendar", () => {
  it("does not mark a future weekday as incomplete, even when the API still returns that status", () => {
    calendarData = [day("2026-09-20", "INCOMPLETE"), day("2026-09-28", "INCOMPLETE")];
    render(<AttendanceCalendar />);

    const pastCell = screen.getByText("20").closest("div");
    const futureCell = screen.getByText("28").closest("div");

    expect(pastCell?.className).toContain("bg-status-late");
    expect(pastCell?.textContent).toContain("codes.INCOMPLETE");

    expect(futureCell?.className).not.toContain("bg-status-late");
    expect(futureCell?.textContent).not.toContain("codes.INCOMPLETE");
    expect(futureCell).not.toHaveAttribute("title");
  });

  it("excludes future days from the status legend tally", () => {
    calendarData = [day("2026-09-20", "INCOMPLETE"), day("2026-09-28", "INCOMPLETE")];
    render(<AttendanceCalendar />);

    // Only the past day should be counted, so the legend shows "1", never "2".
    const counts = Array.from(document.querySelectorAll("dd")).map((el) => el.textContent);
    expect(counts).toEqual(["1"]);
  });

  it("gives today a distinct border without forcing a status", () => {
    calendarData = [];
    render(<AttendanceCalendar />);

    const todayCell = screen.getByText("25").closest("div");
    expect(todayCell?.className).toContain("border-accent");
  });
});
