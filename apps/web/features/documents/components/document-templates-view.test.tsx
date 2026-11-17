import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentTemplatesView } from "./document-templates-view";

const query = vi.fn<() => unknown>();
const setDefault = vi.fn<() => unknown>();
const push = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../settings/components/settings-page", () => ({
  SettingsPage: ({
    children,
    primaryAction,
  }: {
    children: ReactNode;
    primaryAction?: ReactNode;
  }) => (
    <div>
      {primaryAction}
      {children}
    </div>
  ),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../api", () => ({
  DOCUMENT_TEMPLATE_KINDS: ["leave_letter", "member_card"],
  useDocumentTemplatesQuery: () => query() as never,
  useSetDefaultDocumentTemplateMutation: () => setDefault() as never,
}));

const templates = [
  { id: "a", name: "Surat A", kind: "leave_letter", is_default: false, updated_at: "2026-11-12" },
  { id: "b", name: "Surat B", kind: "leave_letter", is_default: false, updated_at: "2026-11-12" },
  { id: "c", name: "Kartu C", kind: "member_card", is_default: true, updated_at: "2026-11-12" },
];

beforeEach(() => {
  query.mockReturnValue({ data: { data: templates }, isLoading: false, isError: false });
  setDefault.mockReturnValue({ mutate: vi.fn(), isPending: false, variables: undefined });
});

afterEach(cleanup);

describe("DocumentTemplatesView", () => {
  it("makes a template the default from its row's menu, not a button that squeezes the name", async () => {
    const mutate = vi.fn();
    setDefault.mockReturnValue({ mutate, isPending: false, variables: undefined });
    const user = userEvent.setup();
    render(<DocumentTemplatesView />);
    expect(screen.queryByRole("button", { name: "setDefault" })).not.toBeInTheDocument();

    const firstMenu = screen.getAllByRole("button", { name: "rowActions" })[0];
    if (!firstMenu) throw new Error("Missing the first row's menu");
    await user.click(firstMenu);
    await user.click(await screen.findByRole("menuitem", { name: "setDefault" }));
    expect(mutate).toHaveBeenCalledWith("a", expect.any(Object));
  });

  it("offers only editing in the default template's menu", async () => {
    const user = userEvent.setup();
    render(<DocumentTemplatesView />);
    // Kartu C, the member card's default, is the third row.
    const defaultMenu = screen.getAllByRole("button", { name: "rowActions" })[2];
    if (!defaultMenu) throw new Error("Missing the default template's menu");
    await user.click(defaultMenu);
    expect(await screen.findByRole("menuitem", { name: "edit" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "setDefault" })).not.toBeInTheDocument();
  });

  it("groups templates by kind and links each to its editor page", () => {
    render(<DocumentTemplatesView />);
    expect(screen.getByRole("heading", { name: /leave_letter/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /member_card/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Surat A/ })).toHaveAttribute(
      "href",
      "/settings/document-templates/a",
    );
    // Every row keeps its actions in one menu.
    expect(screen.getAllByRole("button", { name: "rowActions" })).toHaveLength(3);
  });

  it("offers the first template from the empty state", () => {
    query.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    render(<DocumentTemplatesView />);
    expect(screen.getByRole("link", { name: "addTemplate" })).toHaveAttribute(
      "href",
      "/settings/document-templates/new",
    );
  });

  it("shows a retry control instead of the empty state when loading fails", () => {
    query.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    render(<DocumentTemplatesView />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
