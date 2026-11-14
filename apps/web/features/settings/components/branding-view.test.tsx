import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BrandingView } from "./branding-view";

const mutate = vi.fn();
const branding = {
  name: "SMA Contoh",
  short_name: "",
  tagline: "",
  accent_color: "#0F7A5F",
};

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("@newsekolah/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof UiModule>()),
  useMediaQuery: () => false,
}));
vi.mock("@newsekolah/api-client/react", () => ({
  useTenantBranding: () => ({ data: branding, isLoading: false, isError: false }),
}));
vi.mock("../../../lib/api/client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/theme/theme-provider", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../api", () => ({
  useUpdateBrandingMutation: () => ({ mutate, isPending: false }),
  useRequestLogoUploadMutation: () => ({}),
  useConfirmLogoUploadMutation: () => ({}),
  useRequestFaviconUploadMutation: () => ({}),
  useConfirmFaviconUploadMutation: () => ({}),
}));
vi.mock("./settings-page", () => ({
  SettingsPage: ({ children, floating }: { children: ReactNode; floating?: ReactNode }) => (
    <div>
      {children}
      {floating}
    </div>
  ),
}));

beforeEach(() => {
  mutate.mockClear();
});
afterEach(cleanup);

it("shows the save bar only once the form differs from what is saved", async () => {
  const user = userEvent.setup();
  render(<BrandingView />);
  expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: /taglineLabel/ }), "Unggul");
  expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();

  const [discard] = screen.getAllByRole("button", { name: "discard" });
  if (discard) await user.click(discard);
  expect(screen.getByRole("textbox", { name: /taglineLabel/ })).toHaveValue("");
  expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
});

it("previews the typed name before it is saved", async () => {
  const user = userEvent.setup();
  render(<BrandingView />);
  const name = screen.getByRole("textbox", { name: /nameLabel/ });
  await user.clear(name);
  await user.type(name, "SMA Harapan");
  expect(screen.getAllByText("SMA Harapan").length).toBeGreaterThan(0);
});

it("asks for a name on save instead of sending an empty one", async () => {
  const user = userEvent.setup();
  render(<BrandingView />);
  await user.clear(screen.getByRole("textbox", { name: /nameLabel/ }));
  await user.click(screen.getByRole("button", { name: "save" }));
  expect(mutate).not.toHaveBeenCalled();
  expect(screen.getByText("nameRequiredError")).toBeInTheDocument();
});
