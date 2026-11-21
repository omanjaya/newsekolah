import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryViolation } from "../violations-api";

// A late return with currency fines off records a warning (Rp 0, nothing to
// pay). The member page read it as "unpaid fine Rp 0", counted it on the
// fines tab and held back clearance.
const violations = vi.hoisted<{ data: LibraryViolation[] }>(() => ({ data: [] }));
const empty = vi.hoisted(() => () => ({ data: undefined, isLoading: false, isError: false }));
const mutation = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/members/u1",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../../reference/api", () => ({ useLookup: () => new Map() }));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../api", () => ({
  printMemberCard: vi.fn(),
  useMemberLoanHistoryQuery: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  useMemberReservationsQuery: empty,
  useRenewLoanMutation: mutation,
  useMarkLoanLostMutation: mutation,
  useLibraryLoanRenewalsQuery: empty,
  useLibraryTitleQuery: empty,
}));
vi.mock("../members-api", () => ({
  printLibraryClearanceLetter: vi.fn(),
  useClearLibraryMemberMutation: mutation,
  useUpdateLibraryMemberMutation: mutation,
  useUpdateLibraryMemberStatusMutation: mutation,
  useLibraryMemberQuery: () => ({
    data: { user_id: "u1", member_no: "PS-2026-00024", member_type_id: "mt1", status: "active" },
    isLoading: false,
    isError: false,
  }),
  useLibraryMemberTypesQuery: empty,
}));
vi.mock("../violations-api", () => ({
  useMemberViolationsQuery: () => ({
    data: { data: violations.data },
    isLoading: false,
    isError: false,
  }),
}));

import { MemberDetailView } from "./member-detail-view";

function violation(overrides: Partial<LibraryViolation>): LibraryViolation {
  return {
    id: "v1",
    member_user_id: "u1",
    kind: "late",
    penalty: "warning",
    amount: 0,
    suspend_days: 0,
    status: "unpaid",
    notes: "",
    created_at: "2026-12-14T01:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  violations.data = [];
});

describe("MemberDetailView fines", () => {
  it("does not read a warning or a suspension as an unpaid fine", () => {
    violations.data = [
      violation({ id: "w", penalty: "warning" }),
      violation({ id: "s", penalty: "suspend", suspend_days: 3 }),
    ];
    render(<MemberDetailView userId="u1" />);

    expect(screen.queryByText(/unpaidAlert/)).not.toBeInTheDocument();
    expect(screen.queryByText("clearanceBlockedByLoan")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.fines" })).toBeInTheDocument();
  });

  it("names the money owed and blocks clearance for an unpaid fine", () => {
    violations.data = [
      violation({ id: "w", penalty: "warning" }),
      violation({ id: "f", penalty: "fine", amount: 1500 }),
    ];
    render(<MemberDetailView userId="u1" />);

    const alert = screen.getByText(/unpaidAlert/);
    expect(alert.textContent).toMatch(/1\.500/);
    expect(screen.getByText("clearanceBlockedByLoan")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tabs\.fines/ })).toHaveTextContent("1");
  });

  it("asks for a book to replace without claiming a Rp 0 fine", () => {
    violations.data = [violation({ id: "r", kind: "lost", penalty: "replace_book" })];
    render(<MemberDetailView userId="u1" />);

    expect(screen.getByText("replaceBookAlert")).toBeInTheDocument();
    expect(screen.queryByText(/unpaidAlert/)).not.toBeInTheDocument();
    expect(screen.getByText("clearanceBlockedByLoan")).toBeInTheDocument();
  });
});
