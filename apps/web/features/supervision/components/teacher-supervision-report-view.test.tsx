import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeacherSupervisionReportView } from "./teacher-supervision-report-view";

const report = vi.fn<() => unknown>();
const reportError = vi.hoisted<{ current: unknown }>(() => ({ current: null }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/report-export-dialog", () => ({ ReportExportDialog: () => null }));
vi.mock("../../../lib/i18n/api-error-message", () => ({ useApiErrorMessage: () => () => "" }));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useTeacherSupervisionReportQuery: () =>
    reportError.current
      ? {
          data: undefined,
          isLoading: false,
          isError: true,
          error: reportError.current,
          refetch: vi.fn(),
        }
      : { data: report(), isLoading: false, isError: false, error: null, refetch: vi.fn() },
  downloadTeacherSupervisionReport: vi.fn(),
}));

const cycle = {
  id: "c1",
  name: "Semester ganjil",
  instrument: {
    name: "Instrumen",
    scale_min: 1,
    scale_max: 4,
    criteria: [
      { key: "plan", name: "Perencanaan" },
      { key: "teach", name: "Pelaksanaan" },
    ],
  },
};

afterEach(() => {
  cleanup();
  reportError.current = null;
});

describe("TeacherSupervisionReportView", () => {
  it("shows the teacher's not-found page, back to the cycle results, for a malformed teacher id", () => {
    reportError.current = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "invalid",
      details: [{ field: "teacherId", code: "INVALID_FORMAT" }],
    });
    render(<TeacherSupervisionReportView cycleId="c1" teacherId="abc" />);
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToResults" })).toHaveAttribute(
      "href",
      "/supervision/cycles/c1/report",
    );
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
  });

  it("shows the cycle's not-found page when the cycle is what is missing", () => {
    reportError.current = new ApiError({
      status: 404,
      code: "SUPERVISION_CYCLE_NOT_FOUND",
      message: "not found",
    });
    render(
      <TeacherSupervisionReportView
        cycleId="00000000-0000-0000-0000-000000000000"
        teacherId="t1"
      />,
    );
    expect(screen.getByRole("link", { name: "backToCycles" })).toHaveAttribute(
      "href",
      "/supervision/cycles",
    );

    cleanup();
    reportError.current = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "invalid",
      details: [
        { field: "cycleId", code: "INVALID_FORMAT" },
        { field: "teacherId", code: "INVALID_FORMAT" },
      ],
    });
    render(<TeacherSupervisionReportView cycleId="abc" teacherId="abc" />);
    expect(screen.getByRole("link", { name: "backToCycles" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "backToResults" })).not.toBeInTheDocument();
  });

  it("keeps a retryable failure for an error that is not a missing record", () => {
    reportError.current = new ApiError({ status: 500, code: "INTERNAL", message: "boom" });
    render(<TeacherSupervisionReportView cycleId="c1" teacherId="t1" />);
    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });

  it("shows one empty state and no export while nothing has been observed", () => {
    report.mockReturnValue({
      teacher_name: "Guru Contoh",
      cycle,
      overall_average: 0,
      criterion_average: {},
      observations: [],
    });
    render(<TeacherSupervisionReportView cycleId="c1" teacherId="t1" />);
    expect(screen.getByText("noObservationsTitle")).toBeInTheDocument();
    expect(screen.queryByText("byCriterion")).not.toBeInTheDocument();
    expect(screen.queryByText("overallAverage")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "export" })).not.toBeInTheDocument();
  });

  it("numbers each criterion in its own column, not inside its name", () => {
    report.mockReturnValue({
      teacher_name: "Guru Contoh",
      cycle,
      overall_average: 3,
      criterion_average: { plan: 3, teach: 3 },
      observations: [
        {
          id: "o1",
          observed_at: "2026-11-17T01:00:00Z",
          scores: [{ criterion_key: "plan", score: 3 }],
          teacher_response: null,
        },
      ],
    });
    render(<TeacherSupervisionReportView cycleId="c1" teacherId="t1" />);
    expect(screen.getByRole("meter", { name: "Perencanaan" })).toBeInTheDocument();
    expect(screen.queryByText("1. Perencanaan")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "export" })).toBeEnabled();
  });
});
