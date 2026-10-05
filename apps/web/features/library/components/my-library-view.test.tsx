import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibraryLoan } from "../api";
import type { LibraryMyProfile } from "../me-api";

import { MyLibraryView } from "./my-library-view";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: (value: string) => value,
}));

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

const mocks = vi.hoisted(() => ({ data: undefined as LibraryMyProfile | undefined }));

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

    expect(screen.getByText("unpaidFines")).toBeInTheDocument();
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

    expect(screen.queryByText("unpaidFines")).not.toBeInTheDocument();
  });

  it("hides the unpaid fines card when there are no violations at all", () => {
    mocks.data = profile([]);
    render(<MyLibraryView />);

    expect(screen.queryByText("unpaidFines")).not.toBeInTheDocument();
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

  it("shows four equal-width stat tiles for active loans, next due date, overdue, and reservations", () => {
    mocks.data = {
      ...profile([]),
      active_loans: [
        loan({ id: "a", due_on: "2026-09-20" }),
        loan({ id: "b", due_on: "2026-10-05" }),
      ],
      reservations: [{ id: "r1", title_id: "t1", member_user_id: "u1", status: "waiting" }],
    } as unknown as LibraryMyProfile;

    render(<MyLibraryView />);

    const tiles = screen.getByTestId("my-library-tiles");
    expect(tiles).toHaveClass("lg:grid-cols-4");
    expect(screen.getByTestId("my-library-tile-activeLoans")).toBeInTheDocument();
    expect(screen.getByTestId("my-library-tile-nextDue")).toBeInTheDocument();
    expect(screen.getByTestId("my-library-tile-overdue")).toBeInTheDocument();
    expect(screen.getByTestId("my-library-tile-reservations")).toBeInTheDocument();
  });

  it("spans the last loan card full width when the active loan count is odd", () => {
    mocks.data = {
      ...profile([]),
      active_loans: [loan({ id: "a" }), loan({ id: "b" }), loan({ id: "c" })],
    };

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-loan-cell-a")).not.toHaveClass("lg:col-span-2");
    expect(screen.getByTestId("my-library-loan-cell-b")).not.toHaveClass("lg:col-span-2");
    expect(screen.getByTestId("my-library-loan-cell-c")).toHaveClass("lg:col-span-2");
  });

  it("keeps an even number of loan cards in two equal columns", () => {
    mocks.data = {
      ...profile([]),
      active_loans: [loan({ id: "a" }), loan({ id: "b" })],
    };

    render(<MyLibraryView />);

    expect(screen.getByTestId("my-library-loan-cell-a")).not.toHaveClass("lg:col-span-2");
    expect(screen.getByTestId("my-library-loan-cell-b")).not.toHaveClass("lg:col-span-2");
  });
});
