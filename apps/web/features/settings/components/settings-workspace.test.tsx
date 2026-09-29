import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SettingsWorkspace } from "./settings-workspace";

const state = vi.hoisted(() => ({
  pathname: "/settings/document-templates",
  permissions: [] as string[],
  push: vi.fn(),
  confirm: vi.fn(() => true),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    Select: (props: ComponentProps<typeof actual.Select>) => (
      <select
        aria-label={props["aria-label"]}
        value={props.value}
        onChange={(event) => props.onValueChange?.(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  };
});
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { ...state, profile_kind: "staff" } }),
}));
vi.mock("../../../lib/navigation/use-unsaved-changes-protection", () => ({
  confirmUnsavedChangesBeforeNavigation: state.confirm,
}));
afterEach(cleanup);
beforeEach(() => {
  state.pathname = "/settings/document-templates";
  state.permissions = ["manage_settings"];
  state.push.mockClear();
  state.confirm.mockReturnValue(true);
});

it("links document templates to shared letterhead and the setup checklist", () => {
  render(
    <SettingsWorkspace>
      <div data-testid="content" />
    </SettingsWorkspace>,
  );
  expect(screen.getByRole("link", { name: "letterhead" })).toHaveAttribute(
    "href",
    "/settings/report-header",
  );
  expect(screen.getByRole("link", { name: "setup" })).toHaveAttribute("href", "/setup");
  expect(screen.getByTestId("content")).toBeInTheDocument();
});

it.each([
  "/settings/roles",
  "/settings/security",
  "/settings/notifications",
  "/settings/appearance",
])("leaves %s in its original personal or access context", (pathname) => {
  state.pathname = pathname;
  render(
    <SettingsWorkspace>
      <div data-testid="content" />
    </SettingsWorkspace>,
  );
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByTestId("content")).toBeInTheDocument();
});

it("does not grant WhatsApp managers school notification or setup access", () => {
  state.pathname = "/settings/whatsapp";
  state.permissions = ["manage_whatsapp"];
  render(
    <SettingsWorkspace>
      <div />
    </SettingsWorkspace>,
  );
  expect(screen.queryByRole("link", { name: "notificationDefaults" })).toBeNull();
  expect(screen.queryByRole("link", { name: "setup" })).toBeNull();
  expect(screen.getByRole("combobox", { name: "settings" })).toBeInTheDocument();
});

it("keeps an edited form mounted when its unsaved-changes confirmation is cancelled", async () => {
  state.confirm.mockReturnValue(false);
  render(
    <SettingsWorkspace>
      <div data-testid="edited-form" />
    </SettingsWorkspace>,
  );
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "settings" }), "identity");
  expect(state.confirm).toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
  expect(screen.getByTestId("edited-form")).toBeInTheDocument();
});
