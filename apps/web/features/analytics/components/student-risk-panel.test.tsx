import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const disabled = vi.hoisted(() => new Set<string>());
const risk = vi.hoisted(() => ({
  computed_at: "2026-11-13T00:00:00Z",
  has_grade_trend: false,
  previous_average: 0,
  current_average: 0,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/modules/use-module-enabled", () => ({
  useModuleEnabled: (module: string) => !disabled.has(module),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("./reason-text", () => ({ useReasonText: () => () => "" }));
vi.mock("../api", () => ({
  useStudentRiskQuery: () => ({
    data: {
      level: "watch",
      score: 20,
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
    error: null,
  }),
}));

import { StudentRiskPanel } from "./student-risk-panel";

describe("StudentRiskPanel signals with switched-off modules", () => {
  beforeEach(() => {
    disabled.clear();
    risk.computed_at = "2026-11-13T00:00:00Z";
    risk.has_grade_trend = false;
    risk.previous_average = 0;
    risk.current_average = 0;
  });

  it("lists every signal while discipline and grading are on", () => {
    render(<StudentRiskPanel studentId="s-1" />);
    expect(screen.getByText("signals.discipline")).toBeInTheDocument();
    expect(screen.getByText("signals.warningLetters")).toBeInTheDocument();
    expect(screen.getByText("signals.gradeTrend")).toBeInTheDocument();
  });

  it("leaves out the discipline signals while discipline is off", () => {
    disabled.add("discipline");
    render(<StudentRiskPanel studentId="s-1" />);
    expect(screen.queryByText("signals.discipline")).not.toBeInTheDocument();
    expect(screen.queryByText("signals.warningLetters")).not.toBeInTheDocument();
    expect(screen.getByText("signals.attendance")).toBeInTheDocument();
  });

  it("leaves out the grade trend while grading is off", () => {
    disabled.add("grading");
    render(<StudentRiskPanel studentId="s-1" />);
    expect(screen.queryByText("signals.gradeTrend")).not.toBeInTheDocument();
    expect(screen.getByText("signals.discipline")).toBeInTheDocument();
  });
});

describe("StudentRiskPanel figures", () => {
  beforeEach(() => {
    disabled.clear();
  });

  it("writes the grade averages with the Indonesian decimal comma", () => {
    risk.has_grade_trend = true;
    risk.previous_average = 81.24;
    risk.current_average = 78.46;
    render(<StudentRiskPanel studentId="s-1" />);

    expect(screen.getAllByText("78,5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("81,2").length).toBeGreaterThan(0);
    expect(screen.queryByText("78.5")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /78,5/ })).toBeInTheDocument();
  });

  it("states when the score was computed in the school's time zone", () => {
    // 20:00 UTC on the 13th is already the 14th in Jakarta (UTC+7).
    risk.computed_at = "2026-11-13T20:00:00Z";
    render(<StudentRiskPanel studentId="s-1" />);

    expect(screen.getByText(/freshness .*14 Nov/)).toBeInTheDocument();
  });
});
