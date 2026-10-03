import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useHomeroomAttendanceQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/homeroom",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: (_key: string, fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "me-1",
      tenant: { timezone: "Asia/Jakarta" },
      duties: [{ slug: "homeroom", scope_id: "class-1", scope_label: "X-A" }],
    },
  }),
}));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../attendance/api", () => ({
  todayInZone: () => "2026-09-29",
  useHomeroomAttendanceQuery: mocks.useHomeroomAttendanceQuery,
}));
vi.mock("../../attendance/lib/status-tokens", () => ({ statusToken: () => undefined }));
vi.mock("../../permits/api", () => ({
  useLeaveReviewQueueQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("./homeroom-dashboard", () => ({ HomeroomDashboard: () => null }));

import { HomeroomView } from "./homeroom-view";

/**
 * HomeroomView calls `useHomeroomAttendanceQuery` twice (the filtered
 * roster, then the dashboard's always-unfiltered full-class query), so
 * asserting on the mock's last call is order-dependent. This picks the
 * roster call specifically, by its distinguishing `statusCode` key.
 */
function lastRosterCallArgs(): [unknown, unknown] | undefined {
  const calls = mocks.useHomeroomAttendanceQuery.mock.calls as unknown as [unknown, unknown][];
  return [...calls]
    .reverse()
    .find(([arg]) => typeof arg === "object" && arg !== null && "statusCode" in arg);
}

describe("HomeroomView filters", () => {
  beforeEach(() => {
    mocks.useHomeroomAttendanceQuery.mockReset();
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: { data: [], total: 0, status_counts: {} },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/homeroom");
  });

  it("passes the chosen status to the attendance query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<HomeroomView />);

    await user.click(screen.getByRole("button", { name: "statusFilterLabel" }));
    await user.click(await screen.findByRole("button", { name: "codes.A" }));

    expect(lastRosterCallArgs()).toEqual([expect.objectContaining({ statusCode: "A" }), true]);
    expect(new URLSearchParams(window.location.search).get("status")).toBe("A");
  });

  it("reads an initial status=INCOMPLETE URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/homeroom?status=INCOMPLETE");
    render(<HomeroomView />);

    expect(lastRosterCallArgs()).toEqual([
      expect.objectContaining({ statusCode: "INCOMPLETE" }),
      true,
    ]);
    expect(
      screen.getByRole("button", { name: "statusFilterLabel: codes.INCOMPLETE" }),
    ).toBeInTheDocument();
  });

  it("clears the status filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/homeroom?status=A");
    const user = userEvent.setup();
    render(<HomeroomView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));

    expect(lastRosterCallArgs()).toEqual([
      expect.objectContaining({ statusCode: undefined }),
      true,
    ]);
    expect(new URLSearchParams(window.location.search).get("status")).toBe("");
  });
});
