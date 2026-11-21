import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryLoan } from "../api";
import type { LibraryMyProfile } from "../me-api";

import { MyLibraryView } from "./my-library-view";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));

vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Jakarta" }));

vi.mock("./my-library-loan-row", () => ({
  MyLibraryLoanRow: ({ loan }: { loan: LibraryLoan }) => <p>{loan.title_name ?? loan.id}</p>,
}));

vi.mock("./my-library-reservations", () => ({
  MyLibraryReservations: () => null,
}));

// A member only holds view_own_library_loans, never view_library: history
// rows must never resolve a title through this hook (GET
// /v1/library/titles/{titleId}), which 403s for them.
vi.mock("../api", () => ({
  useLibraryTitleQuery: () => {
    throw new Error("useLibraryTitleQuery must not be called from the history row");
  },
}));

const mocks = vi.hoisted(() => ({
  data: undefined as LibraryMyProfile | undefined,
  permissions: new Set<string>(),
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => mocks.permissions.has(permission),
}));

vi.mock("../me-api", () => ({
  useMyLibraryProfileQuery: () => ({
    data: mocks.data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

function profile(violations: LibraryMyProfile["violations"]): LibraryMyProfile {
  return {
    member: { id: "m1", user_id: "u1", member_no: "M-1", member_type_id: "t1", status: "active" },
    active_loans: [],
    history: [],
    reservations: [],
    violations,
    booking_enabled: true,
  } as unknown as LibraryMyProfile;
}

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

describe("MyLibraryView", () => {
  beforeEach(() => {
    mocks.permissions = new Set();
  });

  it("tells a reader without a membership to ask the librarian", () => {
    mocks.data = { ...profile([]), member: undefined };

    render(<MyLibraryView />);

    expect(screen.getByText("notMemberBody")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browseCatalogue/ })).toHaveAttribute("href", "/opac");
  });

  // A librarian or an admin registers members themselves: "ask the
  // librarian" would send them to themselves.
  it("sends someone who registers members to the members page", () => {
    mocks.permissions = new Set(["manage_library_members"]);
    mocks.data = { ...profile([]), member: undefined };

    render(<MyLibraryView />);

    expect(screen.getByText("notMemberBodyStaff")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /openMembers/ })).toHaveAttribute(
      "href",
      "/library/members",
    );
  });

  it("shows the unpaid fines card when an unpaid violation has a positive amount", () => {
    mocks.data = profile([
      {
        id: "v1",
        member_user_id: "u1",
        kind: "late",
        penalty: "fine",
        amount: 5000,
        suspend_days: 0,
        status: "unpaid",
      },
    ]);
    render(<MyLibraryView />);

    expect(screen.getByText("unpaidFinesTotal")).toBeInTheDocument();
  });

  it("hides the unpaid fines card when the unpaid violation's amount is Rp0", () => {
    mocks.data = profile([
      {
        id: "v1",
        member_user_id: "u1",
        kind: "late",
        penalty: "fine",
        amount: 0,
        suspend_days: 0,
        status: "unpaid",
      },
    ]);
    render(<MyLibraryView />);

    expect(screen.queryByText("unpaidFinesTotal")).not.toBeInTheDocument();
  });

  it("hides the unpaid fines card when there are no violations at all", () => {
    mocks.data = profile([]);
    render(<MyLibraryView />);

    expect(screen.queryByText("unpaidFinesTotal")).not.toBeInTheDocument();
  });

  it("shows a history row's title text from /v1/library/me, never a raw title id", () => {
    mocks.data = {
      ...profile([]),
      history: [
        {
          id: "loan1",
          copy_id: "copy1",
          title_id: "11111111-1111-1111-1111-111111111111",
          title_name: "Matematika Dasar",
          member_user_id: "u1",
          borrowed_at: "2026-09-01T00:00:00Z",
          returned_at: "2026-09-10T00:00:00Z",
          due_on: "2026-09-08",
          renewal_count: 0,
          status: "returned",
          fine_amount: 0,
        },
      ],
    } as unknown as LibraryMyProfile;
    render(<MyLibraryView />);

    expect(screen.getByText("Matematika Dasar")).toBeInTheDocument();
    expect(screen.queryByText("11111111-1111-1111-1111-111111111111")).not.toBeInTheDocument();
  });

  it("leads with the next due date when nothing is late", () => {
    mocks.data = {
      ...profile([]),
      active_loans: [
        loan({ id: "a", due_on: "2999-09-20" }),
        loan({ id: "b", due_on: "2999-10-05" }),
      ],
    };

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-hero")).toHaveTextContent("nextDueTitle");
  });

  it("leads with the late book when one is overdue", () => {
    mocks.data = {
      ...profile([]),
      active_loans: [loan({ id: "a", due_on: "2000-01-01", title_name: "Biologi" })],
    };

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-hero")).toHaveTextContent("overdueTitle");
    // Returning the book is the one thing to do: no way to the catalogue.
    expect(screen.queryByRole("link", { name: /browseCatalogue/ })).not.toBeInTheDocument();
  });

  it("points a reader with no loans at the catalogue", () => {
    mocks.data = profile([]);

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-hero")).toHaveTextContent("idleTitle");
    expect(screen.getByRole("link", { name: /browseCatalogue/ })).toHaveAttribute("href", "/opac");
    // The hero already says nothing is out: no second "nothing borrowed" block under it.
    expect(screen.queryByText("activeLoans")).not.toBeInTheDocument();
    expect(screen.queryByTestId("my-library-loan-cards")).not.toBeInTheDocument();
  });

  // The desk refuses a suspended member (EligibleToBorrow on the server):
  // the page must say so instead of inviting them to come and borrow.
  it("leads with a running suspension instead of the borrow invitation", () => {
    mocks.data = {
      ...profile([
        {
          id: "v1",
          member_user_id: "u1",
          kind: "late",
          penalty: "suspend",
          amount: 0,
          suspend_days: 3,
          status: "unpaid",
        },
      ]),
      member: {
        user_id: "u1",
        member_no: "M-1",
        member_type_id: "t1",
        registered_on: "2026-01-01",
        status: "suspended",
        suspended_until: "2999-12-07",
        late_return_count: 1,
      },
    };

    render(<MyLibraryView />);

    const hero = screen.getByTestId("my-library-hero");
    expect(hero).toHaveTextContent("suspendedTitle");
    expect(hero).not.toHaveTextContent("idleTitle");
    expect(hero).not.toHaveTextContent("idleMeta");
    // The catalogue stays reachable, as a quiet link rather than the CTA.
    expect(screen.getByRole("link", { name: /browseCatalogue/ })).toHaveAttribute("href", "/opac");
  });

  it("puts the suspension ahead of the next due date", () => {
    mocks.data = {
      ...profile([]),
      member: {
        user_id: "u1",
        member_no: "M-1",
        member_type_id: "t1",
        registered_on: "2026-01-01",
        status: "suspended",
        suspended_until: "2999-12-07",
        late_return_count: 1,
      },
      active_loans: [loan({ id: "a", due_on: "2999-09-20" })],
    };

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-hero")).toHaveTextContent("suspendedTitle");
  });

  it("shows the idle hero once the suspension's end date has passed", () => {
    mocks.data = {
      ...profile([]),
      member: {
        user_id: "u1",
        member_no: "M-1",
        member_type_id: "t1",
        registered_on: "2000-01-01",
        status: "suspended",
        suspended_until: "2000-01-07",
        late_return_count: 1,
      },
    };

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-hero")).toHaveTextContent("idleTitle");
  });

  // A suspension still running over a membership that has already ended:
  // the hero promised borrowing again the day after the suspension, a day
  // the desk refuses as an expired membership.
  it("leads with the ended membership while a suspension still runs", () => {
    mocks.data = {
      ...profile([]),
      member: {
        user_id: "u1",
        member_no: "M-1",
        member_type_id: "t1",
        registered_on: "2000-01-01",
        valid_until: "2000-12-31",
        status: "suspended",
        suspended_until: "2999-12-07",
        late_return_count: 1,
      },
    };

    render(<MyLibraryView />);

    const hero = screen.getByTestId("my-library-hero");
    expect(hero).toHaveTextContent("expiredTitle");
    expect(hero).not.toHaveTextContent("suspendedTitle");
  });

  it("promises no borrow-again day past the membership's end", () => {
    mocks.data = {
      ...profile([]),
      member: {
        user_id: "u1",
        member_no: "M-1",
        member_type_id: "t1",
        registered_on: "2026-01-01",
        valid_until: "2999-12-05",
        status: "suspended",
        suspended_until: "2999-12-07",
        late_return_count: 1,
      },
    };

    render(<MyLibraryView />);

    const hero = screen.getByTestId("my-library-hero");
    expect(hero).toHaveTextContent("suspendedTitle");
    expect(screen.getByText("suspendedMetaMembershipEnds")).toBeInTheDocument();
    expect(screen.queryByText("suspendedMeta")).not.toBeInTheDocument();
  });

  it("tells a member with an inactive membership that they cannot borrow", () => {
    mocks.data = {
      ...profile([]),
      member: {
        user_id: "u1",
        member_no: "M-1",
        member_type_id: "t1",
        registered_on: "2026-01-01",
        status: "inactive",
        late_return_count: 0,
      },
    };

    render(<MyLibraryView />);

    const hero = screen.getByTestId("my-library-hero");
    expect(hero).toHaveTextContent("inactiveTitle");
    expect(hero).not.toHaveTextContent("idleMeta");
  });

  it("tells a member whose membership has ended", () => {
    mocks.data = {
      ...profile([]),
      member: {
        user_id: "u1",
        member_no: "M-1",
        member_type_id: "t1",
        registered_on: "2000-01-01",
        valid_until: "2000-12-31",
        status: "active",
        late_return_count: 0,
      },
    };

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-hero")).toHaveTextContent("expiredTitle");
  });

  it("lists every current loan, soonest due first", () => {
    mocks.data = {
      ...profile([]),
      active_loans: [
        loan({ id: "a", title_name: "Later", due_on: "2999-10-05" }),
        loan({ id: "b", title_name: "Sooner", due_on: "2999-09-20" }),
      ],
    };

    render(<MyLibraryView />);

    const cards = screen.getByTestId("my-library-loan-cards");
    const text = cards.textContent;
    expect(text.indexOf("Sooner")).toBeLessThan(text.indexOf("Later"));
  });
});
