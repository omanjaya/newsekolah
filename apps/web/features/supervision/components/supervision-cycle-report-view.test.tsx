import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SupervisionCycleReportView } from "./supervision-cycle-report-view";

const cycleError = vi.hoisted<{ current: unknown }>(() => ({ current: null }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "t1", name: "Guru Satu" }]);
});
vi.mock("../lib/use-cycle-trail", () => ({ useCycleTrail: () => ({ cycle: () => [] }) }));
vi.mock("./cycle-nav", () => ({ CycleNav: () => null }));
vi.mock("../api", () => ({
  useSupervisionCycleQuery: () =>
    cycleError.current
      ? {
          data: undefined,
          isLoading: false,
          isError: true,
          error: cycleError.current,
          refetch: vi.fn(),
        }
      : {
          data: {
            id: "c1",
            name: "Semester ganjil",
            instrument: { name: "Instrumen", criteria: [{ key: "plan", name: "Perencanaan" }] },
          },
          isLoading: false,
          isError: false,
        },
  useScheduledObservationsQuery: () =>
    cycleError.current
      ? { data: undefined, isLoading: false, isError: true, error: cycleError.current }
      : {
          data: {
            data: [{ id: "s1", teacher_user_id: "t1", observation_id: "obs1" }],
          },
          isLoading: false,
          isError: false,
        },
}));

afterEach(() => {
  cleanup();
  cycleError.current = null;
});

describe("SupervisionCycleReportView", () => {
  it("lists each scheduled teacher with a link to their report", () => {
    render(<SupervisionCycleReportView cycleId="c1" />);
    expect(screen.getByRole("link", { name: /Guru Satu/ })).toHaveAttribute(
      "href",
      "/supervision/cycles/c1/teachers/t1/report",
    );
  });

  it.each([
    [
      "a malformed id",
      new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        message: "invalid",
        details: [{ field: "cycleId", code: "INVALID_FORMAT" }],
      }),
    ],
    [
      "an unknown id",
      new ApiError({ status: 404, code: "SUPERVISION_CYCLE_NOT_FOUND", message: "not found" }),
    ],
  ])("shows the cycle's not-found page, with no retry, for %s", (_, error) => {
    cycleError.current = error;
    render(<SupervisionCycleReportView cycleId="abc" />);
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToCycles" })).toHaveAttribute(
      "href",
      "/supervision/cycles",
    );
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
  });

  it("keeps a retryable failure for an error that is not a missing record", () => {
    cycleError.current = new ApiError({ status: 500, code: "INTERNAL", message: "boom" });
    render(<SupervisionCycleReportView cycleId="c1" />);
    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });
});
