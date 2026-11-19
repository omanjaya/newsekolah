import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const risk = vi.hoisted(() => ({
  level: "none",
  computed_at: "2026-11-13T00:00:00Z",
  current_average: 0,
  previous_average: 0,
  has_grade_trend: false,
  error: undefined as ApiError | undefined,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useFormatter: () => ({ dateTime: () => "" }),
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => permission === "view_early_warning",
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/modules/use-module-enabled", () => ({ useModuleEnabled: () => true }));
vi.mock("../../analytics/components/student-risk-panel", () => ({ StudentRiskPanel: () => null }));
vi.mock("../../discipline/api", () => ({
  useStudentDisciplineQuery: () => ({ data: undefined, isLoading: false }),
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
            has_attendance: false,
            absent_days: 0,
            considered_days: 0,
            discipline_points: 0,
            active_violation_count: 0,
            warning_letter_count: 0,
            has_grade_trend: risk.has_grade_trend,
            previous_average: risk.previous_average,
            current_average: risk.current_average,
          },
        },
    isLoading: false,
    isError: risk.error !== undefined,
    error: risk.error,
    refetch: vi.fn(),
  }),
}));

import { StudentOverviewTab } from "./student-overview";

describe("StudentOverviewTab risk figures", () => {
  beforeEach(() => {
    risk.computed_at = "2026-11-13T00:00:00Z";
    risk.has_grade_trend = false;
    risk.current_average = 0;
    risk.previous_average = 0;
    risk.error = undefined;
  });

  it("writes the grade average with one decimal and the Indonesian comma", () => {
    risk.has_grade_trend = true;
    risk.current_average = 78.46;
    risk.previous_average = 80;
    render(<StudentOverviewTab studentId="s-1" />);

    expect(screen.getByText("78,5")).toBeInTheDocument();
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
