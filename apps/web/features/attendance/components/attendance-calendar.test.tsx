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
          period_label: "Jam 1 – Jam 2",
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
          period_label: "Jam 1 – Jam 2",
          teacher_name: "Bu Sari",
          note: "leave letter 21/IZIN/XI/2026",
          source: "leave",
        },
        {
          schedule_id: "sch-2",
          subject_id: "subj-2",
          subject_name: "Biologi",
          status_code: "S",
          period_label: "Jam 3",
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

  // On a phone the text column is about 242px wide: a lesson a letter
  // fills (period, teacher, letter number, source) needs three lines there,
  // and the meta was one joined string clamped at two, so it ended in
  // "Diisi otomatis dari..." (audit r9v-attendance-reports-R1).
  it("keeps every fact of a letter-filled lesson whole, on as many lines as there are facts", () => {
    calendarData = [
      day("2026-09-20", "I", [
        {
          schedule_id: "sch-1",
          subject_id: "subj-1",
          subject_name: "Matematika",
          status_code: "I",
          period_label: "Jam 1 – Jam 11",
          teacher_name: "Guru Contoh",
          note: "leave letter 22/IZIN/IV/2027",
          source: "leave",
        },
      ]),
    ];
    render(<AttendanceCalendar />);

    fireEvent.click(dayButton("20"));

    const row = screen.getByText("Matematika").closest("li") as HTMLElement;
    const facts = Array.from(row.querySelectorAll("[data-meta-fact]")).map((el) =>
      el.textContent.replace(/\s·$/, ""),
    );
    // One box per fact, so the line wraps between facts and never inside one.
    expect(facts).toEqual([
      "Jam 1 – Jam 11",
      "Guru Contoh",
      'leaveLetterNote {"number":"22/IZIN/IV/2027"}',
      "sessionSource.leave",
    ]);
    // Room for each fact on a line of its own: none is clamped away.
    const metaBox = row.querySelector("[data-meta-fact]")?.parentElement;
    expect(metaBox?.className).toContain("line-clamp-4");
    expect(metaBox?.className).not.toContain("line-clamp-2");
    // The letter number is short and fixed: one line, like the period.
    expect(screen.getByText('leaveLetterNote {"number":"22/IZIN/IV/2027"}')).toHaveClass(
      "truncate",
    );
  });

  // Each fact a one-line box cut a titled name or a sentence-long note of
  // the teacher's to an ellipsis on a phone, with no way to read the rest
  // and empty meta lines below it (audit r9v-attendance-reports-R1).
  it("wraps a teacher's name and own note instead of cutting them to one line", () => {
    const teacher = "Dra. Hj. Siti Nurhaliza Kartika, S.Pd.";
    const note = "Datang terlambat karena hujan deras, sudah izin lewat telepon kepada wali kelas";
    calendarData = [
      day("2026-09-20", "S", [
        {
          schedule_id: "sch-1",
          subject_id: "subj-1",
          subject_name: "Matematika",
          status_code: "S",
          period_label: "Jam 1 – Jam 2",
          teacher_name: teacher,
          note,
          source: "teacher",
        },
      ]),
    ];
    render(<AttendanceCalendar />);

    fireEvent.click(dayButton("20"));

    const noteFact = screen.getByText(note);
    expect(noteFact).toHaveAttribute("data-meta-wrap");
    expect(noteFact.closest(".truncate")).toBeNull();
    const teacherFact = screen.getByText((_, el) =>
      Boolean(el?.hasAttribute("data-meta-fact") && el.textContent.startsWith(teacher)),
    );
    expect(teacherFact).toHaveAttribute("data-meta-wrap");
    expect(teacherFact.closest(".truncate")).toBeNull();
    expect(screen.getByText("Jam 1 – Jam 2")).toHaveClass("truncate");
  });

  // The API names every lesson a letter covers; a row it cannot name (a
  // student with no class) is titled by the letter, not by a bare
  // "Subject", and its zero schedule id is no key of its own (audit
  // r5v-auth-attendance-R2).
  it("titles a covered row with no lesson by the letter that covers it", () => {
    const zero = "00000000-0000-0000-0000-000000000000";
    calendarData = [
      day("2026-09-20", "I", [
        {
          schedule_id: zero,
          subject_id: zero,
          status_code: "I",
          note: "leave letter 16/IZIN/II/2027",
          source: "leave",
        },
        { schedule_id: zero, subject_id: zero, status_code: "D", source: "permit" },
      ]),
    ];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<AttendanceCalendar />);

    fireEvent.click(dayButton("20"));

    const leaveRow = screen.getByText("coveredBy.leave").closest("li");
    expect(leaveRow).toHaveTextContent('leaveLetterNote {"number":"16/IZIN/II/2027"}');
    expect(leaveRow).not.toHaveTextContent("sessionSource.leave");
    expect(screen.getByText("coveredBy.permit")).toBeInTheDocument();
    expect(screen.queryByText("unknownSubject")).toBeNull();
    expect(consoleError.mock.calls.flat().map(String).join(" ")).not.toContain("same key");
    consoleError.mockRestore();
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
