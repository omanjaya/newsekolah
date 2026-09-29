import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as AttendanceApiModule from "../api";

import { AttendanceCalendar } from "./attendance-calendar";

type CalendarDay = AttendanceApiModule.CalendarDay;

const TODAY = "2026-09-25";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
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

function day(
  date: string,
  statusCode: string,
  sessions: CalendarDay["sessions"] = [],
): CalendarDay {
  return {
    date,
    status_code: statusCode,
    expected_sessions: 3,
    submitted_sessions: 0,
    complete: false,
    sessions,
  };
}

function dayButton(dayNumber: string): HTMLElement {
  return screen.getByText(dayNumber).closest("button") as HTMLElement;
}

describe("AttendanceCalendar", () => {
  it("gives every past day a single status dot with an aria-label naming date and status", () => {
    calendarData = [day("2026-09-20", "S")];
    render(<AttendanceCalendar />);

    const button = dayButton("20");
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("2026-09-20"));
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("codes.S"));
    // Exactly one dot, not a full colored block or a text label in the cell.
    const dots = button.querySelectorAll("span.rounded-full");
    expect(dots).toHaveLength(1);
    expect(dots[0]?.className).toContain("bg-status-sick");
    expect(button.textContent).not.toContain("codes.S");
  });

  it("does not mark a future weekday as incomplete, even when the API still returns that status", () => {
    calendarData = [day("2026-09-20", "INCOMPLETE"), day("2026-09-28", "INCOMPLETE")];
    render(<AttendanceCalendar />);

    const pastCell = dayButton("20");
    const futureCell = dayButton("28");

    expect(pastCell.querySelector("span.rounded-full")?.className).toContain("bg-fg-muted/40");
    expect(futureCell.querySelector("span.rounded-full")).toBeNull();
    expect(futureCell).toHaveAttribute("aria-label", expect.stringContaining("codes.NONE"));
  });

  it("excludes future days from the status legend tally", () => {
    calendarData = [day("2026-09-20", "INCOMPLETE"), day("2026-09-28", "INCOMPLETE")];
    render(<AttendanceCalendar />);

    const counts = Array.from(document.querySelectorAll("dd")).map((el) => el.textContent);
    expect(counts).toEqual(["1"]);
  });

  it("gives today a distinct border without forcing a status", () => {
    calendarData = [];
    render(<AttendanceCalendar />);

    const todayCell = dayButton("25");
    expect(todayCell.className).toContain("border-accent");
  });

  it("defaults the detail card to today and updates it when another day is selected", () => {
    calendarData = [
      day("2026-09-20", "S", [
        {
          schedule_id: "sch-1",
          subject_id: "subj-1",
          subject_name: "Matematika",
          status_code: "S",
          period_label: "1-2",
          teacher_name: "Bu Sari",
        },
      ]),
      day("2026-09-25", "H"),
    ];
    render(<AttendanceCalendar />);

    // Defaults to today (25).
    expect(screen.getByText("2026-09-25")).toBeInTheDocument();
    expect(screen.queryByText("Matematika")).not.toBeInTheDocument();

    fireEvent.click(dayButton("20"));

    expect(screen.getByText("2026-09-20")).toBeInTheDocument();
    expect(screen.getByText("Matematika")).toBeInTheDocument();
  });

  it("shows a short sentence in the detail card when the selected day has no per-session data", () => {
    calendarData = [day("2026-09-20", "A", [])];
    render(<AttendanceCalendar />);

    fireEvent.click(dayButton("20"));

    expect(screen.getByText('daySentence {"status":"codes.A"}')).toBeInTheDocument();
  });
});
