import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const unread = vi.hoisted(() => ({ count: 0 }));
const list = vi.hoisted(() => ({ data: [] as unknown[] }));
const markRead = vi.hoisted(() => vi.fn());

import { NotificationsView } from "./notifications-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/i18n", () => ({ formatRelative: () => "5 menit lalu" }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      tenant: { timezone: "Asia/Jakarta" },
      permissions: [],
      roles: [],
      disabled_modules: [],
    },
  }),
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
    data: { data: list.data },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUnreadCountQuery: () => ({ data: { count: unread.count } }),
  useMarkReadMutation: () => ({ mutate: markRead }),
  useMarkAllReadMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  list.data = [];
  unread.count = 0;
  markRead.mockReset();
});

describe("NotificationsView", () => {
  it("filters all or unread with a segmented control, not tabs without panels", () => {
    render(<NotificationsView />);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "filterAll" })).toBeChecked();
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("offers every notification again from an empty unread filter", () => {
    render(<NotificationsView />);
    fireEvent.click(screen.getByRole("radio", { name: "filterUnread" }));
    expect(screen.getByText("emptyUnreadTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "showAll" }));
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("enables mark-all-read from the server unread count even when the loaded page has none", () => {
    unread.count = 3;
    render(<NotificationsView />);
    expect(screen.getByRole("button", { name: "markAllRead" })).toBeEnabled();
  });

  it("disables mark-all-read when nothing is unread", () => {
    render(<NotificationsView />);
    expect(screen.getByRole("button", { name: "markAllRead" })).toBeDisabled();
  });

  it("lists a day's notifications as rows that open their link and mark them read", () => {
    list.data = [
      {
        id: "n1",
        kind: "leave_request_submitted",
        title: "Izin baru",
        body: "Budi mengajukan izin sakit",
        href: "/leave-requests/abc",
        created_at: "2026-11-14T01:00:00Z",
      },
    ];
    render(<NotificationsView />);
    const link = screen.getByRole("link", { name: /Izin baru/ });
    expect(link).toHaveAttribute("href", "/leave-requests/abc");
    expect(link).toHaveTextContent("unreadMarker");
    fireEvent.click(link);
    expect(markRead).toHaveBeenCalledWith("n1");
  });
});
