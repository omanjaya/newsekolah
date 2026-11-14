import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AnnouncementsView } from "./announcements-view";

const mocks = vi.hoisted(() => ({ canCreate: true, canPublish: true }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
// A tiny URL store: router.replace changes the query and every reader re-renders.
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  let query = "";
  const listeners = new Set<() => void>();
  return {
    usePathname: () => "/announcements",
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          () => query,
        ),
      ),
    useRouter: () => ({
      replace: (href: string) => {
        query = href.split("?")[1] ?? "";
        listeners.forEach((listener) => {
          listener();
        });
      },
    }),
  };
});
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) =>
    permission === "create_announcements" ? mocks.canCreate : mocks.canPublish,
}));
vi.mock("./announcement-feed", () => ({ AnnouncementFeed: () => <div data-testid="feed" /> }));
vi.mock("./announcements-manage", () => ({
  AnnouncementsManage: ({ creating }: { creating: boolean }) => (
    <div data-testid="manage">{creating ? "creating" : "idle"}</div>
  ),
}));

beforeEach(() => {
  mocks.canCreate = true;
  mocks.canPublish = true;
});
afterEach(cleanup);

it("offers the create action from the feed tab and opens the editor on the manage tab", async () => {
  const user = userEvent.setup();
  render(<AnnouncementsView />);
  expect(screen.getByTestId("feed")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "actions.create" }));
  expect(screen.getByTestId("manage")).toHaveTextContent("creating");
});

it("shows the create pill in the shared header once the manage tab is active, and opens the editor from it", async () => {
  const user = userEvent.setup();
  render(<AnnouncementsView />);

  await user.click(screen.getByRole("tab", { name: "tabManage" }));
  const createButton = screen.getByRole("button", { name: "actions.create" });
  expect(createButton).toBeInTheDocument();

  await user.click(createButton);
  expect(screen.getByTestId("manage")).toHaveTextContent("creating");
});

it("never shows the create pill for a reader who cannot author announcements", () => {
  mocks.canCreate = false;
  mocks.canPublish = false;
  render(<AnnouncementsView />);
  expect(screen.queryByRole("tab", { name: "tabManage" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "actions.create" })).not.toBeInTheDocument();
});
