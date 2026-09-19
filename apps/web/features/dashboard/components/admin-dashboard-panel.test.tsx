import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ useAdminDashboardQuery: query }));
vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
  useFormatter: () => ({ number: (value: number) => String(value) }),
}));

import { AdminDashboardPanel } from "./admin-dashboard-panel";

type Roles = Parameters<typeof AdminDashboardPanel>[0]["roles"];
const roles = [{ id: "admin", slug: "admin", name: "Admin" }] as Roles;

describe("dashboard operational sections", () => {
  beforeEach(() => query.mockReset());

  it("does not request admin statistics for another role", () => {
    query.mockReturnValue({});
    const { container } = render(<AdminDashboardPanel roles={[]} section="summary" />);
    expect(query).toHaveBeenCalledWith(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows loading without presenting zero accounts", () => {
    query.mockReturnValue({ isLoading: true });
    const { container } = render(<AdminDashboardPanel roles={roles} section="summary" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("offers retry instead of displaying zero queues on failure", () => {
    query.mockReturnValue({ isError: true, refetch: vi.fn() });
    render(<AdminDashboardPanel roles={roles} section="queue" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps request types and pending counts together in the queue table", () => {
    query.mockReturnValue({
      data: { pending: { leave_request: 3, exit_permit: 2, late_arrival: 0 } },
    });
    render(<AdminDashboardPanel roles={roles} section="queue" />);
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(
      screen.getByRole("link", { name: "openQueue: pendingLabels.leave_request" }),
    ).toHaveAttribute("href", "/leave-requests");
    expect(screen.getByRole("cell", { name: "3" })).toBeInTheDocument();
  });
});
