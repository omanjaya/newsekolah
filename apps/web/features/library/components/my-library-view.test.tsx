import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  MyLibraryLoanRow: () => null,
}));

vi.mock("./my-library-reservations", () => ({
  MyLibraryReservations: () => null,
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
});
