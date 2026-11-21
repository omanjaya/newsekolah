import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryMember } from "../members-api";
import type { LibraryViolation } from "../violations-api";

// A late return with currency fines off records a warning (Rp 0, nothing to
// pay). The member page read it as "unpaid fine Rp 0", counted it on the
// fines tab and held back clearance.
const violations = vi.hoisted<{ data: LibraryViolation[] }>(() => ({ data: [] }));
const empty = vi.hoisted(() => () => ({ data: undefined, isLoading: false, isError: false }));
const mutation = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));
const search = vi.hoisted(() => ({ query: "" }));
const record = vi.hoisted<{ member: Partial<LibraryMember> }>(() => ({ member: {} }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/members/u1",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.query),
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
  useLibraryMemberQuery: () => ({ data: record.member, isLoading: false, isError: false }),
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
  search.query = "";
  record.member = {
    user_id: "u1",
    member_no: "PS-2026-00024",
    member_type_id: "mt1",
    status: "active",
  };
});

afterEach(() => {
  vi.useRealTimers();
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

  it("keeps an unsettled suspension reachable without counting it as money owed", () => {
    violations.data = [violation({ id: "s", penalty: "suspend", suspend_days: 3 })];
    search.query = "tab=fines";
    render(<MemberDetailView userId="u1" />);

    expect(screen.queryByText("viewFines")).not.toBeInTheDocument();
    expect(screen.queryByText("nothingOutstandingBody")).not.toBeInTheDocument();
    expect(screen.getByText("suspensionsOutstanding")).toBeInTheDocument();
    expect(screen.getByText("penalties.suspend")).toBeInTheDocument();
    expect(screen.queryByText(/Rp/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "fines.manage" })).toHaveAttribute(
      "href",
      "/library/violations?member=u1",
    );
    expect(screen.queryByText("clearanceBlockedByLoan")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.fines" })).toBeInTheDocument();
  });

  // Marking a running suspension settled left the page with
  // "Ditangguhkan" and no end date, and a fines tab saying every fine is
  // paid: the reason for the suspension was gone from the staff screens.
  it("keeps a running suspension and its last day in view once it is settled", () => {
    record.member = { ...record.member, status: "suspended", suspended_until: "2999-12-07" };
    violations.data = [violation({ id: "s", penalty: "suspend", suspend_days: 3, status: "paid" })];
    search.query = "tab=fines";
    render(<MemberDetailView userId="u1" />);

    expect(screen.getByText(/^suspendedUntil /)).toBeInTheDocument();
    expect(screen.getByText(/^suspensionRunning /)).toBeInTheDocument();
    expect(screen.getByText(/^suspensionBorrowFrom /)).toBeInTheDocument();
    expect(screen.queryByText("nothingOutstandingTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("suspensionsOutstanding")).not.toBeInTheDocument();
  });

  // Suspended through 7 Dec with a membership valid through 30 Nov, on
  // 4 Dec: the ended membership is named first, and the page lost the
  // running suspension, so a settled one left "nothing outstanding" while
  // the server still refuses every loan on the suspension.
  it("keeps a running suspension in view once the membership has also ended", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-04T03:00:00Z"));
    record.member = {
      ...record.member,
      status: "suspended",
      suspended_until: "2026-12-07",
      valid_until: "2026-11-30",
    };
    violations.data = [violation({ id: "s", penalty: "suspend", suspend_days: 3, status: "paid" })];
    search.query = "tab=fines";
    render(<MemberDetailView userId="u1" />);

    expect(screen.getByText('suspendedUntil {"date":"7 Des"}')).toBeInTheDocument();
    expect(screen.getByText("membershipExpiredNote")).toBeInTheDocument();
    expect(screen.getByText('suspensionRunning {"date":"7 Des"}')).toBeInTheDocument();
    expect(screen.getByText('suspensionMembershipEnded {"date":"30 Nov"}')).toBeInTheDocument();
    expect(screen.queryByText(/^suspensionBorrowFrom /)).not.toBeInTheDocument();
    expect(screen.queryByText("nothingOutstandingTitle")).not.toBeInTheDocument();
  });

  it("reads a suspension whose last day has passed as active", () => {
    record.member = { ...record.member, status: "suspended", suspended_until: "2000-01-07" };
    violations.data = [violation({ id: "s", penalty: "suspend", suspend_days: 3, status: "paid" })];
    search.query = "tab=fines";
    render(<MemberDetailView userId="u1" />);

    expect(screen.getAllByText("status.active").length).toBeGreaterThan(0);
    expect(screen.queryByText("status.suspended")).not.toBeInTheDocument();
    expect(screen.queryByText(/^suspendedUntil /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^suspensionRunning/)).not.toBeInTheDocument();
    expect(screen.getByText("nothingOutstandingTitle")).toBeInTheDocument();
  });

  it("words the empty fines tab for every sanction, not only money", () => {
    search.query = "tab=fines";
    render(<MemberDetailView userId="u1" />);

    expect(screen.getByText("nothingOutstandingTitle")).toBeInTheDocument();
    expect(screen.getByText("nothingOutstandingBody")).toBeInTheDocument();
  });

  it("notes an ended membership beside the status", () => {
    record.member = { ...record.member, valid_until: "2000-12-31" };
    render(<MemberDetailView userId="u1" />);

    expect(screen.getByText("membershipExpiredNote")).toBeInTheDocument();
  });

  it("names a book to replace beside the money owed", () => {
    violations.data = [
      violation({ id: "f", penalty: "fine", amount: 1500 }),
      violation({ id: "r", kind: "lost", penalty: "replace_book" }),
    ];
    render(<MemberDetailView userId="u1" />);

    expect(screen.getByText(/unpaidAlert/).textContent).toMatch(/1\.500/);
    expect(screen.getByText("replaceBookAlert")).toBeInTheDocument();
  });
});
