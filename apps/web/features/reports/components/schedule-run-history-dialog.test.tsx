import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleRunHistoryDialog } from "./schedule-run-history-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useReportScheduleRunsQuery: () => ({
    isLoading: false,
    data: {
      data: [{ id: "r1", due_at: "2026-09-25T20:00:00Z", status: "success", error_message: null }],
    },
  }),
}));

describe("ScheduleRunHistoryDialog", () => {
  it("shows run times in the school timezone, not the browser's", () => {
    render(<ScheduleRunHistoryDialog scheduleId="s1" onClose={vi.fn()} />);

    // 20:00 UTC on 25 Sep is 03:00 on 26 Sep in Jakarta.
    expect(screen.getByText(/26 September 2026/)).toBeInTheDocument();
    expect(screen.getByText(/03\.00/)).toBeInTheDocument();
  });
});
