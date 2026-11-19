import { ApiError, type components } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomeroomOverview, type OverviewRead } from "./homeroom-overview";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "Sab, 4 Jul", dateTimeRange: () => "4-5 Jul" }),
}));

type LeaveRequestSummary = components["schemas"]["LeaveRequestSummary"];

const outOfTerm: OverviewRead = {
  isLoading: false,
  isFetching: false,
  isError: true,
  error: new ApiError({ status: 403, code: "ATTENDANCE_NOT_HOMEROOM", message: "forbidden" }),
  refetch: vi.fn(),
};

const leave = {
  instance_id: "leave-1",
  student_name: "Budi Santoso",
  starts_on: "2026-07-06",
  ends_on: "2026-07-07",
  class_id: "class-1",
} as LeaveRequestSummary;

function renderOverview(leaveQueue: OverviewRead, pendingLeave: LeaveRequestSummary[]) {
  return render(
    <HomeroomOverview
      date="2026-07-04"
      today="2026-09-29"
      dashboard={outOfTerm}
      leaveQueue={leaveQueue}
      counts={{}}
      attentionRows={[]}
      disciplineRows={[]}
      pendingLeave={pendingLeave}
      showLeave
      showDiscipline
      onShowStatus={vi.fn()}
      onShowToday={vi.fn()}
    />,
  );
}

// The leave queue does not depend on the chosen day: a day outside the
// homeroom term hid it with the day's cards, while the stat above still
// counted it (audit r5-n5).
describe("HomeroomOverview outside the homeroom term", () => {
  it("keeps the pending-leave card and drops the cards read from the day", () => {
    renderOverview(
      { isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() },
      [leave],
    );

    expect(screen.getByRole("heading", { name: "outOfTermTitle" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^pendingLeaveTitle/ })).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^attentionListTitle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^disciplineTitle/ })).not.toBeInTheDocument();
  });

  it("offers a retry in the card when the leave queue fails", async () => {
    const refetch = vi.fn();
    renderOverview(
      { isLoading: false, isFetching: false, isError: true, error: new Error("500"), refetch },
      [],
    );
    const user = userEvent.setup();

    expect(screen.getByRole("heading", { name: "pendingLeaveTitle" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "actions.retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});
