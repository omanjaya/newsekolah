import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LeaveRequestSummary } from "../api";

import { MyLeaveRequests } from "./my-leave-requests";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("../../../components/query-error", () => ({
  QueryError: () => <div data-testid="query-error" />,
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));

vi.mock("./leave-request-detail", () => ({
  LeaveRequestDetail: ({ id }: { id: string }) => <div data-testid="detail-stub">{id}</div>,
}));

vi.mock("./leave-request-submit-form", () => ({
  SubmitForm: () => <div data-testid="submit-stub" />,
}));

let mineItems: LeaveRequestSummary[] = [];
let mineLoading = false;

vi.mock("../api", () => ({
  useMyLeaveRequestsQuery: () => ({
    data: { data: mineItems },
    isLoading: mineLoading,
    isError: false,
    refetch: vi.fn(),
  }),
  // The active request's detail (stage labels and times) is still loading:
  // the card falls back to the compact track built from the summary.
  useLeaveRequestQuery: () => ({ data: undefined, isLoading: true }),
}));

function item(
  overrides: Partial<LeaveRequestSummary> & { instance_id: string },
): LeaveRequestSummary {
  return {
    student_user_id: "student-1",
    status: "in_progress",
    current_stage_index: 0,
    category: "sick",
    starts_on: "2026-09-29",
    ends_on: "2026-09-29",
    student_name: "Siswa Contoh",
    class_name: "Kelas 10 A",
    opened_at: "2026-09-28T10:00:00Z",
    ...overrides,
  };
}

function renderMine(onCreate = vi.fn()) {
  return render(
    <MyLeaveRequests creating={false} onCreatingChange={vi.fn()} onCreate={onCreate} />,
  );
}

describe("MyLeaveRequests", () => {
  it("offers the first request from the empty state, with no counts yet", async () => {
    mineItems = [];
    mineLoading = false;
    const onCreate = vi.fn();
    renderMine(onCreate);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    // The same glyph as leave everywhere else (domainIcons.leave), not a calendar.
    expect(document.querySelector("svg.lucide-clipboard-list")).not.toBeNull();
    expect(document.querySelector("svg.lucide-calendar-x2")).toBeNull();
    expect(screen.queryByTestId("leave-mine-tiles")).not.toBeInTheDocument();
    const repeat = screen.getByRole("button", { name: "submit" });
    // The header carries the primary; the empty list repeats it quietly.
    expect(repeat).not.toHaveClass("bg-accent");
    await userEvent.click(repeat);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("counts requests by status into the four stats", () => {
    mineItems = [
      item({ instance_id: "a", status: "in_progress" }),
      item({ instance_id: "b", status: "approved" }),
      item({ instance_id: "c", status: "completed" }),
      item({ instance_id: "d", status: "rejected" }),
    ];
    renderMine();
    expect(within(screen.getByTestId("leave-mine-tile-total")).getByText("4")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("leave-mine-tile-inProgress")).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("leave-mine-tile-approved")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("leave-mine-tile-rejected")).getByText("1"),
    ).toBeInTheDocument();
  });

  it("puts the request on its way first as the status card, the rest in the history", () => {
    mineItems = [
      item({ instance_id: "done", status: "completed" }),
      item({ instance_id: "live", status: "in_progress" }),
    ];
    renderMine();
    const hero = screen.getByTestId("leave-mine-card-live");
    expect(within(hero).getByText("hero.eyebrow")).toBeInTheDocument();
    // The compact track marks the stage it waits on.
    const current = within(hero)
      .getAllByRole("listitem")
      .find((node) => node.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent("stageHomeroom");
    expect(screen.getByText("historyTitle")).toBeInTheDocument();
    expect(screen.getByTestId("leave-mine-card-done")).toBeInTheDocument();
  });

  it("says a request once in its date range, with the number of days", () => {
    mineItems = [
      item({
        instance_id: "a",
        status: "completed",
        starts_on: "2026-09-29",
        ends_on: "2026-10-01",
      }),
    ];
    renderMine();
    const row = screen.getByTestId("leave-mine-card-a");
    expect(row).toHaveTextContent('days:{"count":3}');
    expect(row).not.toHaveTextContent(/29 Sep 2026.*29 Sep 2026/);
  });

  it("opens the detail when a history row is chosen", async () => {
    mineItems = [item({ instance_id: "a", status: "completed" })];
    renderMine();
    await userEvent.click(within(screen.getByTestId("leave-mine-card-a")).getByRole("button"));
    expect(screen.getByTestId("detail-stub")).toHaveTextContent("a");
  });
});
