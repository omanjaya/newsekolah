import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AnnouncementsView } from "./announcements-view";

const mocks = vi.hoisted(() => ({ canCreate: true, canPublish: true }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
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

it("keeps the primary create action out of the header while the feed tab is active", () => {
  render(<AnnouncementsView />);
  expect(screen.getByTestId("feed")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "actions.create" })).not.toBeInTheDocument();
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
