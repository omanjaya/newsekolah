import { render, screen, within } from "@testing-library/react";
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

describe("MyLeaveRequests", () => {
  it("renders the calm empty sentence, not a dashed empty-state box, when there are nothing", () => {
    mineItems = [];
    mineLoading = false;
    const { container } = render(<MyLeaveRequests creating={false} onCreatingChange={vi.fn()} />);
    expect(screen.getByText("emptyBody")).toBeInTheDocument();
    expect(container.querySelector(".border-dashed")).toBeNull();
    expect(screen.queryByTestId("leave-mine-tiles")).not.toBeInTheDocument();
  });

  it("counts requests by status into the four stat tiles", () => {
    mineItems = [
      item({ instance_id: "a", status: "in_progress" }),
      item({ instance_id: "b", status: "approved" }),
      item({ instance_id: "c", status: "completed" }),
      item({ instance_id: "d", status: "rejected" }),
    ];
    mineLoading = false;
    render(<MyLeaveRequests creating={false} onCreatingChange={vi.fn()} />);

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

  it("spans the last card full width for an odd request count", () => {
    mineItems = [
      item({ instance_id: "a" }),
      item({ instance_id: "b" }),
      item({ instance_id: "c" }),
    ];
    mineLoading = false;
    render(<MyLeaveRequests creating={false} onCreatingChange={vi.fn()} />);

    const cells = ["a", "b", "c"].map((id) => screen.getByTestId(`leave-mine-cell-${id}`));
    expect(cells[0]?.className).not.toContain("lg:col-span-2");
    expect(cells[1]?.className).not.toContain("lg:col-span-2");
    expect(cells[2]?.className).toContain("lg:col-span-2");
  });

  it("does not span any card for an even request count", () => {
    mineItems = [item({ instance_id: "a" }), item({ instance_id: "b" })];
    mineLoading = false;
    render(<MyLeaveRequests creating={false} onCreatingChange={vi.fn()} />);

    for (const id of ["a", "b"]) {
      expect(screen.getByTestId(`leave-mine-cell-${id}`).className).not.toContain("lg:col-span-2");
    }
  });

  it("shows the compact stage track with the current stage marked for an in-progress request", () => {
    mineItems = [item({ instance_id: "a", status: "in_progress", current_stage_index: 0 })];
    mineLoading = false;
    render(<MyLeaveRequests creating={false} onCreatingChange={vi.fn()} />);

    const card = screen.getByTestId("leave-mine-card-a");
    expect(within(card).getByTestId("mine-stage-track-node-submitted")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(within(card).getByTestId("mine-stage-track-node-homeroom")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(within(card).getByTestId("mine-stage-track-node-done")).toHaveAttribute(
      "data-state",
      "upcoming",
    );
  });

  it("shows the stage track stopped at the rejected stage", () => {
    mineItems = [item({ instance_id: "a", status: "rejected", current_stage_index: 0 })];
    mineLoading = false;
    render(<MyLeaveRequests creating={false} onCreatingChange={vi.fn()} />);

    const card = screen.getByTestId("leave-mine-card-a");
    expect(within(card).getByTestId("mine-stage-track-node-homeroom")).toHaveAttribute(
      "data-state",
      "stopped",
    );
  });
});
