import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchedulesView } from "./schedules-view";

const schedulesQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
      { has: () => false },
    ),
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("./schedule-form", () => ({ ScheduleForm: () => null }));
vi.mock("./schedule-run-history-dialog", () => ({
  ScheduleRunHistoryDialog: ({ scheduleId }: { scheduleId: string | null }) =>
    scheduleId ? <p>history for {scheduleId}</p> : null,
}));
vi.mock("../api", () => ({
  useReportSchedulesQuery: () => schedulesQuery(),
  useSetReportScheduleEnabledMutation: () => ({ mutate: vi.fn() }),
  useDeleteReportScheduleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

const schedule = {
  id: "s1",
  report_kind: "discipline.points",
  cadence: "daily",
  hour: 7,
  recipients: ["kepala@sekolah.test"],
  next_run_at: "2026-11-20T00:00:00Z",
  enabled: true,
};

describe("SchedulesView", () => {
  it("shows a load error with a retry, not the empty state", async () => {
    const refetch = vi.fn();
    schedulesQuery.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      data: undefined,
      refetch,
      isRefetching: false,
    });
    render(<SchedulesView />);
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    await userEvent.click(within(alert).getByRole("button"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("names each row's controls after the schedule and keeps history in its menu", async () => {
    schedulesQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: [schedule] },
      refetch: vi.fn(),
      isRefetching: false,
    });
    const user = userEvent.setup();
    render(<SchedulesView />);

    const name =
      'scheduleName:{"report":"discipline.points","cadence":"cadenceSummary.daily:{\\"hour\\":\\"07\\"}"}';
    expect(
      screen.getAllByRole("switch", { name: `enabledFor:${JSON.stringify({ name })}` }),
    ).not.toHaveLength(0);
    const [menu] = screen.getAllByRole("button", {
      name: `rowActions:${JSON.stringify({ name })}`,
    });
    if (!menu) throw new Error("no row menu");
    await user.click(menu);
    expect(await screen.findByRole("menuitem", { name: "delete" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "viewHistory" }));
    expect(screen.getByText("history for s1")).toBeInTheDocument();
  });
});
