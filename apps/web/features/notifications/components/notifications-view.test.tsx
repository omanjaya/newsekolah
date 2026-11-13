import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const unread = vi.hoisted(() => ({ count: 0 }));

import { NotificationsView } from "./notifications-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" }, permissions: [] } }),
}));
vi.mock("../../../lib/use-day-label", () => ({ useDayLabel: () => (key: string) => key }));
vi.mock("../../../lib/view-state/view-state-provider", async () => {
  const { useState } = await import("react");
  return {
    useRememberedViewState: <T,>(_key: string, initial: T) => useState<T>(initial),
  };
});
vi.mock("../api", () => ({
  useNotificationKinds: () => [],
  useNotificationsQuery: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUnreadCountQuery: () => ({ data: { count: unread.count } }),
  useMarkReadMutation: () => ({ mutate: vi.fn() }),
  useMarkAllReadMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("NotificationsView", () => {
  it("renders the list inside the tab panel the active filter tab controls", () => {
    render(<NotificationsView />);

    const controls = screen.getByRole("tab", { selected: true }).getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const panel = document.getElementById(controls ?? "");
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(panel).toHaveTextContent("emptyTitle");
  });

  it("enables mark-all-read from the server unread count even when the loaded page has none", () => {
    unread.count = 3;
    render(<NotificationsView />);
    expect(screen.getByRole("button", { name: "markAllRead" })).toBeEnabled();
    unread.count = 0;
  });

  it("disables mark-all-read when nothing is unread", () => {
    render(<NotificationsView />);
    expect(screen.getByRole("button", { name: "markAllRead" })).toBeDisabled();
  });
});
