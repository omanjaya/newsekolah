import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const disabled = vi.hoisted(() => new Set<string>());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
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
      computed_at: "2026-11-13T00:00:00Z",
      reasons: [],
      signals: {
        has_attendance: false,
        absent_days: 0,
        considered_days: 0,
        discipline_points: 0,
        active_violation_count: 0,
        warning_letter_count: 0,
        has_grade_trend: false,
        previous_average: 0,
        current_average: 0,
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
