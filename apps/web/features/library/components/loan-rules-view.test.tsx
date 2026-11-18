import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryLoanRule } from "../loan-rules-api";

const mocks = vi.hoisted(() => ({ rules: [] as LibraryLoanRule[] }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../loan-rules-api", () => ({
  useLibraryLoanRulesQuery: () => ({
    data: { data: mocks.rules },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateLibraryLoanRuleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLibraryLoanRuleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({ data: { data: [{ id: "mt1", name: "Siswa" }] } }),
}));
vi.mock("./library-policy-dialog", () => ({ LibraryPolicyDialog: () => null }));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { LoanRulesView } from "./loan-rules-view";

describe("LoanRulesView", () => {
  beforeEach(() => {
    mocks.rules = [];
  });

  // The empty state carries the one primary; a second one in the toolbar
  // read as two competing calls to action.
  it("offers Tambah aturan once when there are no rules", () => {
    render(<LoanRulesView />);

    expect(screen.getAllByRole("button", { name: "add" })).toHaveLength(1);
  });

  it("keeps Tambah aturan in the toolbar once rules exist", () => {
    mocks.rules = [
      {
        id: "r1",
        member_type_id: "mt1",
        starts_on: "2026-12-01",
        ends_on: "2026-12-31",
        allow_loans: true,
        max_loan_items: 2,
        max_loan_days: 7,
      },
    ];
    render(<LoanRulesView />);

    expect(screen.getByRole("button", { name: "add" })).toBeInTheDocument();
  });
});
