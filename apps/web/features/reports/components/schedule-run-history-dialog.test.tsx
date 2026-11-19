import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScheduleRunHistoryDialog } from "./schedule-run-history-dialog";

const runsQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <p>query error</p>,
}));
vi.mock("../api", () => ({
  useReportScheduleRunsQuery: () => runsQuery(),
}));

afterEach(cleanup);

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
