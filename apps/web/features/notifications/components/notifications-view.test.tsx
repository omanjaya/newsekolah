import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
});
