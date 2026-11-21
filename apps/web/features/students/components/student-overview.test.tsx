import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const risk = vi.hoisted(() => ({
  level: "none",
  computed_at: "2026-11-13T00:00:00Z",
  current_average: 0,
  previous_average: 0,
  has_grade_trend: false,
  scored_subjects: 0,
  score_decimals: 2,
  has_attendance: false,
  absent_days: 0,
  considered_days: 0,
  error: undefined as ApiError | undefined,
}));
const discipline = vi.hoisted(() => ({
  permissions: ["view_early_warning"] as string[],
  live: undefined as
    | {
        total_points: number;
        records: {
          id: string;
          is_voided: boolean;
          occurred_on: string;
          type_name: string;
          points: number;
        }[];
        letters: { id: string; issued_at: string; level_label: string; letter_number: string }[];
      }
    | undefined,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useFormatter: () => ({ dateTime: () => "" }),
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => discipline.permissions.includes(permission),
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/modules/use-module-enabled", () => ({ useModuleEnabled: () => true }));
vi.mock("../../analytics/components/student-risk-panel", () => ({ StudentRiskPanel: () => null }));
vi.mock("../../discipline/api", () => ({
  useStudentDisciplineQuery: (_id: string, enabled = true) => ({
    data: enabled ? discipline.live : undefined,
    isLoading: false,
  }),
}));
vi.mock("../../discipline/api-counseling-extras", () => ({
  useStudentCounselingsQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("../../mentoring/api", () => ({
  useMentorStudentSnapshotQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("../../school/api", () => ({ useUserQuery: () => ({ data: undefined }) }));
vi.mock("../../analytics/api", () => ({
  useStudentRiskQuery: () => ({
    data: risk.error
      ? undefined
      : {
          level: risk.level,
          score: 0,
          computed_at: risk.computed_at,
          reasons: [],
          signals: {
            has_attendance: risk.has_attendance,
            absent_days: risk.absent_days,
            considered_days: risk.considered_days,
            discipline_points: 0,
            active_violation_count: 0,
            warning_letter_count: 0,
            has_grade_trend: risk.has_grade_trend,
            previous_average: risk.previous_average,
            current_average: risk.current_average,
            scored_subjects: risk.scored_subjects,
            subjects_below_kktp: 0,
            score_decimals: risk.score_decimals,
          },
        },
    isLoading: false,
    isError: risk.error !== undefined,
    error: risk.error,
    refetch: vi.fn(),
  }),
}));

import { StudentOverviewTab } from "./student-overview";

/** The soft circle behind the alpha-days tile's icon, which carries its hue. */
function absenceIcon(): Element {
  const circle = document.querySelector(".lucide-calendar-x")?.closest("[data-stat-icon]");
  if (!circle) throw new Error("absence icon not found");
  return circle;
}

describe("StudentOverviewTab risk figures", () => {
  beforeEach(() => {
    risk.computed_at = "2026-11-13T00:00:00Z";
    risk.has_grade_trend = false;
    risk.scored_subjects = 0;
    risk.current_average = 0;
    risk.previous_average = 0;
    risk.score_decimals = 2;
    risk.error = undefined;
    risk.has_attendance = false;
    risk.absent_days = 0;
    risk.considered_days = 0;
    discipline.permissions = ["view_early_warning"];
    discipline.live = undefined;
  });

  // r4v-grades-discipline-R1: the card rounded to one decimal (78,5) while
  // the gradebook and the student's own page showed the scale's 78,46.
  it("writes the grade average at the scale's precision with the Indonesian comma", () => {
    risk.has_grade_trend = true;
    risk.scored_subjects = 4;
    risk.current_average = 78.46;
    risk.previous_average = 80;
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("78,46")).toBeInTheDocument();
    expect(screen.queryByText("78,5")).not.toBeInTheDocument();
    expect(screen.getByText('gradeDelta {"delta":"1,54"}')).toBeInTheDocument();
  });

  it("follows a school whose scale keeps one decimal", () => {
    risk.has_grade_trend = true;
    risk.scored_subjects = 4;
    risk.current_average = 78.46;
    risk.previous_average = 80;
    risk.score_decimals = 1;
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("78,5")).toBeInTheDocument();
    expect(screen.getByText('gradeDelta {"delta":"1,5"}')).toBeInTheDocument();
  });

  it("shows no change when the averages match at the scale's precision", () => {
    risk.has_grade_trend = true;
    risk.scored_subjects = 4;
    risk.current_average = 80.001;
    risk.previous_average = 80;
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.queryByText(/gradeDelta/)).not.toBeInTheDocument();
  });

  // grades-discipline-R3: in a first term (no previous term to compare)
  // the card said "Belum ada nilai terbit" while the same page counted the
  // student's published grades below KKTP.
  it("shows a first term's published average without a trend", () => {
    risk.has_grade_trend = false;
    risk.scored_subjects = 1;
    risk.current_average = 55.08;
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("55,08")).toBeInTheDocument();
    expect(screen.getByText("noGradeTrend")).toBeInTheDocument();
    expect(screen.queryByText("noGrades")).not.toBeInTheDocument();
  });

  it("says there are no published grades only when no subject has a report score", () => {
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("noGrades")).toBeInTheDocument();
    expect(screen.queryByText("noGradeTrend")).not.toBeInTheDocument();
  });

  it("names the attendance figure as alpha days, so a sick day never reads as present", () => {
    // Two school days: one present, one sick. The signal counts alpha only.
    risk.has_attendance = true;
    risk.absent_days = 0;
    risk.considered_days = 2;
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("unexcusedAbsence")).toBeInTheDocument();
    expect(screen.getByText('unexcusedOf {"days":2}')).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.queryByText("attendance")).not.toBeInTheDocument();
    expect(absenceIcon()).not.toHaveClass("text-category-amber");
    expect(absenceIcon()).not.toHaveClass("text-category-green");
  });

  it("marks alpha days with an absence icon in a warning hue, never a green check", () => {
    risk.has_attendance = true;
    risk.absent_days = 5;
    risk.considered_days = 20;
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(absenceIcon()).toHaveClass("text-category-amber");
    expect(document.querySelector(".lucide-calendar-check")).toBeNull();
  });

  it("states when the score was computed in the school's time zone", () => {
    // 20:00 UTC on the 13th is already the 14th in Jakarta (UTC+7).
    risk.computed_at = "2026-11-13T20:00:00Z";
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText(/freshness .*14 Nov/)).toBeInTheDocument();
  });

  it("reads a missing early-warning result as no result, not a failure to retry", () => {
    risk.error = new ApiError({
      status: 404,
      code: "ANALYTICS_RESULT_NOT_FOUND",
      message: "not found",
    });
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("noResultTitle")).toBeInTheDocument();
    expect(screen.getByText("noResultBody")).toBeInTheDocument();
    expect(screen.queryByText("ANALYTICS_RESULT_NOT_FOUND")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("StudentOverviewTab discipline figures", () => {
  beforeEach(() => {
    risk.error = undefined;
    discipline.live = undefined;
  });

  // The stored risk score said 0 points and 0 letters next to a timeline
  // with SP 3 and an 81-point record: the figures now come from discipline.
  it("shows the live points, active violations and letters, not the stored score's", () => {
    discipline.permissions = ["view_early_warning", "view_discipline"];
    discipline.live = {
      total_points: 81,
      records: [
        { id: "r1", is_voided: false, occurred_on: "2026-11-20", type_name: "Bolos", points: 25 },
        { id: "r2", is_voided: false, occurred_on: "2026-11-19", type_name: "Bolos", points: 56 },
        { id: "r3", is_voided: true, occurred_on: "2026-11-18", type_name: "Bolos", points: 10 },
      ],
      letters: ["1", "2", "3"].map((n) => ({
        id: `l${n}`,
        issued_at: `2026-11-20T0${n}:00:00Z`,
        level_label: `SP ${n}`,
        letter_number: `00${n}/SP/XI/2026`,
      })),
    };
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getByText('activeViolations {"n":2}')).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("falls back to the stored score for a reader without discipline access", () => {
    discipline.permissions = ["view_early_warning"];
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText('activeViolations {"n":0}')).toBeInTheDocument();
  });
});
