import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibraryLoan } from "../api";

import { MyLibraryLoanRow } from "./my-library-loan-row";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: (value: string) => value,
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

vi.mock("../me-api", () => ({
  useRenewMyLoanMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

// A member only holds view_own_library_loans, never view_library: this row
// must never resolve a title through this hook (GET
// /v1/library/titles/{titleId}), which 403s for them.
vi.mock("../api", () => ({
  useLibraryTitleQuery: () => {
    throw new Error("useLibraryTitleQuery must not be called from the active loan row");
  },
}));

function loan(patch: Partial<LibraryLoan> = {}): LibraryLoan {
  return {
    id: "loan1",
    copy_id: "copy1",
    title_id: "11111111-1111-1111-1111-111111111111",
    member_user_id: "u1",
    borrowed_at: "2026-09-01T00:00:00Z",
    due_on: "2026-10-01",
    renewal_count: 0,
    status: "active",
    fine_amount: 0,
    ...patch,
  };
}

describe("MyLibraryLoanRow", () => {
  it("shows the loan's title text from /v1/library/me, never a raw title id", () => {
    render(
      <MyLibraryLoanRow
        loan={loan({ title_name: "Matematika Dasar" })}
        today="2026-09-15"
        locale="id"
      />,
    );

    expect(screen.getByText("Matematika Dasar")).toBeInTheDocument();
    expect(screen.queryByText("11111111-1111-1111-1111-111111111111")).not.toBeInTheDocument();
  });

  it("shows a readable placeholder, not the raw title id, when no title text is present", () => {
    render(<MyLibraryLoanRow loan={loan()} today="2026-09-15" locale="id" />);

    expect(screen.getByText("titleUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("11111111-1111-1111-1111-111111111111")).not.toBeInTheDocument();
  });

  it("shows the author when the loan carries one", () => {
    render(
      <MyLibraryLoanRow
        loan={loan({ title_name: "Matematika Dasar", title_author: "Budi Santoso" })}
        today="2026-09-15"
        locale="id"
      />,
    );

    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
  });

  it("omits the author line when the loan has none", () => {
    render(
      <MyLibraryLoanRow
        loan={loan({ title_name: "Matematika Dasar" })}
        today="2026-09-15"
        locale="id"
      />,
    );

    expect(screen.queryByText("Budi Santoso")).not.toBeInTheDocument();
  });
});
