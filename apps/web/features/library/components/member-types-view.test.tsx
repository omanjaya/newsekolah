import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemberTypesView } from "./member-types-view";

const access = vi.hoisted(() => ({ canManage: true }));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => access.canManage }));
vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({ data: { data: [] }, isLoading: false, refetch: vi.fn() }),
  useDeleteLibraryMemberTypeMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./member-type-form", () => ({ MemberTypeForm: () => null }));

describe("MemberTypesView, a settings hub section", () => {
  beforeEach(() => {
    access.canManage = true;
  });

  it("leaves the page heading to the hub and offers adding a type from the table", () => {
    render(<MemberTypesView />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    // In the table toolbar and again in the empty list's call to action.
    expect(screen.getAllByRole("button", { name: "addType" })).toHaveLength(2);
  });

  it("does not offer adding a type to a reader who cannot manage settings", () => {
    access.canManage = false;
    render(<MemberTypesView />);
    expect(screen.queryByRole("button", { name: "addType" })).not.toBeInTheDocument();
  });
});
