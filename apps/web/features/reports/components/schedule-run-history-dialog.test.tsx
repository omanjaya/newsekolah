import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScheduleRunHistoryDialog } from "./schedule-run-history-dialog";

const runsQuery = vi.fn<() => unknown>();
const downloadMutate = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${String(values.time)}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <p>query error</p>,
}));
vi.mock("../api", () => ({
  useReportScheduleRunsQuery: () => runsQuery(),
  useReportScheduleRunDownloadMutation: () => ({ mutate: downloadMutate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  downloadMutate.mockReset();
});

function runs(data: unknown[]) {
  return { isLoading: false, isError: false, data: { data } };
}

describe("ScheduleRunHistoryDialog", () => {
  it("shows run times in the school timezone, not the browser's", () => {
    runsQuery.mockReturnValue(
      runs([{ id: "r1", due_at: "2026-09-25T20:00:00Z", status: "success", error_message: "" }]),
    );
    render(<ScheduleRunHistoryDialog scheduleId="s1" onClose={vi.fn()} />);

    // 20:00 UTC on 25 Sep is 03:00 on 26 Sep in Jakarta.
    expect(screen.getByText(/26 September 2026/)).toBeInTheDocument();
    expect(screen.getByText(/03\.00/)).toBeInTheDocument();
  });

  it("names a failure by its code, never the API's technical message", () => {
    runsQuery.mockReturnValue(
      runs([
        {
          id: "r1",
          due_at: "2026-09-25T20:00:00Z",
          status: "failed",
          failure_code: "upload_failed",
          error_message: "upload: bucket unreachable",
        },
        {
          id: "r2",
          due_at: "2026-09-24T20:00:00Z",
          status: "failed",
          error_message: "smtp: 550",
        },
      ]),
    );
    render(<ScheduleRunHistoryDialog scheduleId="s1" onClose={vi.fn()} />);

    expect(screen.getByText("failure.upload_failed")).toBeInTheDocument();
    expect(screen.getByText("failure.unknown")).toBeInTheDocument();
    expect(screen.queryByText(/bucket unreachable/)).not.toBeInTheDocument();
    expect(screen.queryByText(/smtp/)).not.toBeInTheDocument();
  });

  it("shows when a run actually ran, or that it is still waiting", () => {
    runsQuery.mockReturnValue(
      runs([
        {
          id: "r1",
          schedule_id: "s1",
          due_at: "2026-11-20T03:00:00Z",
          ran_at: "2026-11-20T03:00:12Z",
          status: "success",
          error_message: "",
        },
        {
          id: "r2",
          schedule_id: "s1",
          due_at: "2026-11-21T03:00:00Z",
          ran_at: null,
          status: "pending",
          error_message: "",
        },
      ]),
    );
    render(<ScheduleRunHistoryDialog scheduleId="s1" onClose={vi.fn()} />);

    // 03:00 UTC is 10:00 in Jakarta; the run itself started 12 seconds later.
    expect(screen.getAllByText(/^dueAt:.*10\.00/)).toHaveLength(2);
    expect(screen.getByText(/^ranAt:.*10\.00/)).toBeInTheDocument();
    expect(screen.getByText("notRunYet")).toBeInTheDocument();
  });

  it("offers the stored file of a run whose email failed", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    downloadMutate.mockImplementation(
      (_vars, { onSuccess }: { onSuccess: (r: { url: string }) => void }) => {
        onSuccess({ url: "https://storage.test/report.xlsx" });
      },
    );
    runsQuery.mockReturnValue(
      runs([
        {
          id: "r1",
          schedule_id: "s1",
          due_at: "2026-11-20T03:00:00Z",
          ran_at: "2026-11-20T03:00:12Z",
          status: "failed",
          failure_code: "send_failed",
          object_key: "reports/schedules/t/s1/1.xlsx",
          error_message: "smtp: 550",
        },
        {
          id: "r2",
          schedule_id: "s1",
          due_at: "2026-11-19T03:00:00Z",
          ran_at: "2026-11-19T03:00:12Z",
          status: "failed",
          failure_code: "render_failed",
          object_key: "",
          error_message: "render: boom",
        },
      ]),
    );
    render(<ScheduleRunHistoryDialog scheduleId="s1" onClose={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: "download" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "download" }));
    expect(downloadMutate).toHaveBeenCalledWith(
      { scheduleId: "s1", runId: "r1" },
      expect.anything(),
    );
    expect(open).toHaveBeenCalledWith(
      "https://storage.test/report.xlsx",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("shows a load error with a retry instead of the empty history", () => {
    runsQuery.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      data: undefined,
      refetch: vi.fn(),
    });
    render(<ScheduleRunHistoryDialog scheduleId="s1" onClose={vi.fn()} />);

    expect(screen.getByText("query error")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
