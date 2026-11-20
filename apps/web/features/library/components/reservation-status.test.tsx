import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import library from "../../../messages/features/library.id.json";
import type { LibraryReservation } from "../api";

import { MemberReservations } from "./member-detail-sections";
import { ReservationStatus } from "./reservation-status";

vi.mock("./library-title-name", () => ({
  LibraryTitleName: ({ titleId }: { titleId: string }) => <>{titleId}</>,
}));

// Fri 20 Nov 2026 16:00 WITA.
vi.mock("../../../lib/simulation/clock", () => ({
  businessNow: () => new Date("2026-11-20T08:00:00Z"),
}));

const NOW = new Date("2026-11-20T08:00:00Z");

function withMessages(ui: ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="id"
      messages={{ app: { library } }}
      onError={(error) => {
        throw error;
      }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

function hold(overrides: Partial<LibraryReservation>): LibraryReservation {
  return {
    id: "res-1",
    title_id: "Laskar Pelangi",
    member_user_id: "member-1",
    status: "ready",
    requested_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("ReservationStatus", () => {
  // A ready hold used to read only "Siap diambil": the member had no way to
  // learn the hold lapses on its own.
  it("names the pickup deadline on the school's calendar", () => {
    withMessages(
      <ReservationStatus
        reservation={hold({ expires_at: "2026-11-24T15:59:59Z" })}
        now={NOW}
        locale="id"
        timeZone="Asia/Makassar"
        today="2026-11-20"
      />,
    );

    expect(screen.getByText("Siap diambil")).toBeInTheDocument();
    expect(screen.getByText("Ambil paling lambat 24 Nov pukul 23.59")).toBeInTheDocument();
  });

  it("reads a hold past its deadline as expired, with the deadline it missed", () => {
    withMessages(
      <ReservationStatus
        reservation={hold({ expires_at: "2026-11-18T01:00:00Z" })}
        now={NOW}
        locale="id"
        timeZone="Asia/Makassar"
        today="2026-11-20"
      />,
    );

    expect(screen.getByText("Kedaluwarsa")).toBeInTheDocument();
    expect(screen.queryByText("Siap diambil")).not.toBeInTheDocument();
    expect(screen.getByText("Batas ambil 18 Nov pukul 09.00 sudah lewat")).toBeInTheDocument();
  });

  it("shows a waiting hold's queue position and no deadline", () => {
    withMessages(
      <ReservationStatus
        reservation={{ ...hold({ status: "waiting" }), position: 2 }}
        now={NOW}
        locale="id"
        timeZone="Asia/Makassar"
      />,
    );

    expect(screen.getByText("Antrean ke-2")).toBeInTheDocument();
    expect(screen.queryByText(/Ambil paling lambat/)).not.toBeInTheDocument();
  });
});

describe("MemberReservations", () => {
  it("tells the librarian until when each ready hold is kept", () => {
    withMessages(
      <MemberReservations
        reservations={[hold({ expires_at: "2026-11-24T15:59:59Z" })]}
        locale="id"
        timeZone="Asia/Makassar"
        today="2026-11-20"
      />,
    );

    expect(screen.getByText("Ambil paling lambat 24 Nov pukul 23.59")).toBeInTheDocument();
  });
});
