import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MemberTypesView } from "./member-types-view";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({ data: { data: [] }, isLoading: false }),
  useDeleteLibraryMemberTypeMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./library-workspace-nav", () => ({
  LibraryWorkspaceNav: () => <nav data-testid="workspace-nav" />,
}));
vi.mock("./member-type-form", () => ({ MemberTypeForm: () => null }));

describe("MemberTypesView chrome", () => {
  it("renders the page header and workspace nav on its own route", () => {
    render(<MemberTypesView />);
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByTestId("workspace-nav")).toBeInTheDocument();
  });

  it("drops the header and workspace nav when embedded in the settings hub", () => {
    render(<MemberTypesView embedded />);
    expect(screen.queryByRole("heading", { name: "title" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-nav")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "addType" })).toBeInTheDocument();
  });
});
