import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentTemplatesView } from "./document-templates-view";

const query = vi.fn<() => unknown>();
const setDefault = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => "id",
}));
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
  it("spins only the row whose default is being set", () => {
    setDefault.mockReturnValue({ mutate: vi.fn(), isPending: true, variables: "a" });
    render(<DocumentTemplatesView />);
    const buttons = screen.getAllByRole("button", { name: "setDefault" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("aria-busy", "true");
    expect(buttons[1]).not.toHaveAttribute("aria-busy", "true");
  });

  it("groups templates by kind and links each to its editor page", () => {
    render(<DocumentTemplatesView />);
    expect(screen.getByRole("heading", { name: /leave_letter/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /member_card/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Surat A/ })).toHaveAttribute(
      "href",
      "/settings/document-templates/a",
    );
    // The default of its kind is marked, not offered as a button.
    expect(screen.getAllByRole("button", { name: "setDefault" })).toHaveLength(2);
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
