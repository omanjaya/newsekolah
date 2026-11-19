import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { SettingsHubView } from "./settings-hub-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      permissions: ["tenant.settings.manage"],
      profile_kind: "staff",
      roles: [{ slug: "admin" }],
      disabled_modules: [],
      duties: [],
    },
  }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));

afterEach(cleanup);

it("offers to clear the search, not filters, when nothing matches", async () => {
  const user = userEvent.setup();
  render(<SettingsHubView />);
  const search = screen.queryByRole("searchbox") ?? screen.getByRole("textbox");
  await user.type(search, "zzzz-no-match");

  expect(screen.getByText("app.settingsHub.emptyTitle")).toBeInTheDocument();
  const reset = screen.getByRole("button", { name: "app.settingsHub.clearSearch" });
  await user.click(reset);
  expect(search).toHaveValue("");
});
