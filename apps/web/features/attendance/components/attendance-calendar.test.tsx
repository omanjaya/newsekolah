import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as AttendanceApiModule from "../api";

import { AttendanceCalendar } from "./attendance-calendar";

type CalendarDay = AttendanceApiModule.CalendarDay;

const TODAY = "2026-09-25";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));

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

    // Amber, the colour the day card's "Belum lengkap" badge and every report use.
    expect(pastCell.querySelector("span.rounded-full")?.className).toContain("ring-status-late");
    expect(futureCell.querySelector("span.rounded-full")).toBeNull();
    expect(futureCell).toHaveAttribute("aria-label", expect.stringContaining("codes.NONE"));
  });

  it("excludes future days from the status legend tally", () => {
    calendarData = [day("2026-09-20", "INCOMPLETE"), day("2026-09-28", "INCOMPLETE")];
    render(<AttendanceCalendar />);

    const legend = screen.getByLabelText("legendLabel");
    const counts = Array.from(legend.querySelectorAll("dd")).map((el) => el.textContent);
    expect(counts).toEqual(["1"]);
  });

  it("rings today without forcing a status", () => {
    calendarData = [];
    render(<AttendanceCalendar />);

    const todayCell = dayButton("25");
    expect(todayCell.className).toContain("ring-accent");
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

  it("shows a leave letter's number in a localized phrase, not the API's English note", () => {
    calendarData = [
      day("2026-09-20", "S", [
        {
          schedule_id: "sch-1",
          subject_id: "subj-1",
          subject_name: "Matematika",
          status_code: "S",
          period_label: "1-2",
          teacher_name: "Bu Sari",
          note: "leave letter 21/IZIN/XI/2026",
          source: "leave",
        },
        {
          schedule_id: "sch-2",
          subject_id: "subj-2",
          subject_name: "Biologi",
          status_code: "S",
          period_label: "3",
          teacher_name: "Pak Budi",
          note: "Surat dari dokter",
          source: "leave",
        },
      ]),
    ];
    render(<AttendanceCalendar />);

    fireEvent.click(dayButton("20"));

    const letterRow = screen.getByText("Matematika").closest("li");
    expect(letterRow).toHaveTextContent('leaveLetterNote {"number":"21/IZIN/XI/2026"}');
    expect(letterRow).not.toHaveTextContent("leave letter");
    // A note without the API's prefix is shown as written.
    expect(screen.getByText("Biologi").closest("li")).toHaveTextContent("Surat dari dokter");
  });

  it("shows a short sentence in the detail card when the selected day has no per-session data", () => {
    calendarData = [day("2026-09-20", "A", [])];
    render(<AttendanceCalendar />);

    fireEvent.click(dayButton("20"));

    expect(screen.getByText('daySentence {"status":"codes.A"}')).toBeInTheDocument();
  });

  it("names the month's figures for assistive technology", () => {
    calendarData = [];
    render(<AttendanceCalendar />);

    const group = screen.getByRole("group", { name: "statsLabel" });
    expect(group).toContainElement(screen.getByTestId("attendance-mine-tiles"));
  });

  describe("bringing the day's detail into view", () => {
    function stubViewport(sideBySide: boolean, reduceMotion = false) {
      vi.stubGlobal(
        "matchMedia",
        (query: string) =>
          ({
            matches: query.includes("min-width") ? sideBySide : reduceMotion,
            media: query,
          }) as MediaQueryList,
      );
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      return scrollIntoView;
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("scrolls the detail into view on a phone, where it sits under the calendar", () => {
      const scrollIntoView = stubViewport(false);
      calendarData = [day("2026-09-18", "INCOMPLETE")];
      render(<AttendanceCalendar />);

      fireEvent.click(dayButton("18"));

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId("attendance-day-detail"));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    });

    it("jumps without a smooth scroll under reduced motion", () => {
      const scrollIntoView = stubViewport(false, true);
      render(<AttendanceCalendar />);

      fireEvent.click(dayButton("18"));

      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
    });

    it("leaves the page still on a wide screen, where the detail sits beside the calendar", () => {
      const scrollIntoView = stubViewport(true);
      render(<AttendanceCalendar />);

      fireEvent.click(dayButton("18"));

      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
