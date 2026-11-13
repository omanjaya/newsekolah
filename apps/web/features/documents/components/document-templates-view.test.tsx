import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentTemplatesView } from "./document-templates-view";

const query = vi.fn<() => unknown>();
const setDefault = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("./template-editor", () => ({ TemplateEditor: () => null }));
vi.mock("../api", () => ({
  useDocumentTemplatesQuery: () => query() as never,
  useSetDefaultDocumentTemplateMutation: () => setDefault() as never,
}));

const templates = [
  { id: "a", name: "Surat A", kind: "permit", is_default: false },
  { id: "b", name: "Surat B", kind: "permit", is_default: false },
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

  it("shows a retry control instead of the empty state when loading fails", () => {
    query.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    render(<DocumentTemplatesView />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
