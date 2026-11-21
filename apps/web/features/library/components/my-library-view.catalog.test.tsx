import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import library from "../../../messages/features/library.id.json";
import type { LibraryMyProfile } from "../me-api";

import { MyLibraryView } from "./my-library-view";

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Jakarta" }));
vi.mock("./my-library-reservations", () => ({ MyLibraryReservations: () => null }));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
vi.mock("../../../lib/simulation/clock", () => ({
  businessNow: () => new Date("2026-12-04T03:00:00Z"),
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

function renderWithCatalog() {
  render(
    <NextIntlClientProvider
      locale="id"
      timeZone="Asia/Jakarta"
      messages={{ app: { library }, common: {} }}
      onError={(error) => {
        throw error;
      }}
    >
      <MyLibraryView />
    </NextIntlClientProvider>,
  );
}

describe("MyLibraryView with the real catalog", () => {
  // The reported case: returned two working days late on 4 Dec, suspended
  // through 7 Dec. The page names the last day and the day borrowing opens.
  it("names the suspension's last day and when borrowing opens again", () => {
    mocks.data = {
      member: {
        user_id: "u1",
        member_no: "PS-2026-00028",
        member_type_id: "t1",
        registered_on: "2026-11-01",
        status: "suspended",
        suspended_until: "2026-12-07",
        late_return_count: 1,
      },
      active_loans: [],
      history: [],
      reservations: [],
      violations: [
        {
          id: "v1",
          member_user_id: "u1",
          kind: "late",
          penalty: "suspend",
          amount: 0,
          suspend_days: 3,
          status: "unpaid",
        },
      ],
      booking_enabled: true,
    };

    renderWithCatalog();

    const hero = screen.getByTestId("my-library-hero");
    expect(hero).toHaveTextContent("Peminjaman ditangguhkan sampai 7 Des");
    expect(hero).toHaveTextContent("Bisa meminjam lagi mulai 8 Des");
    expect(hero).not.toHaveTextContent("Belum ada buku yang dipinjam");
    expect(hero).not.toHaveTextContent("pinjam di perpustakaan");
  });
});
