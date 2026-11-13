import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationPanel } from "./notification-panel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" }, permissions: [] } }),
}));
vi.mock("../api", () => ({
  useNotificationsQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  }),
  useMarkReadMutation: () => ({ mutate: vi.fn() }),
  useMarkAllReadMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe("NotificationPanel", () => {
  it("offers a retry instead of saying there are no notifications when loading fails", () => {
    render(<NotificationPanel onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
