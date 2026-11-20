import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MyLibraryReservations as Reservations } from "./my-library-reservations";

// The page passes the school's calendar; the rows here only need the props.
function MyLibraryReservations(
  props: Omit<Parameters<typeof Reservations>[0], "locale" | "timeZone" | "today">,
) {
  return <Reservations {...props} locale="id" timeZone="Asia/Makassar" today="2026-11-20" />;
}

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

vi.mock("../me-api", () => ({
  useReserveMyLibraryTitleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelMyLibraryReservationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("./my-library-title-picker", () => ({
  MyLibraryTitlePicker: () => null,
}));

// Fri 20 Nov 2026 16:00 WITA.
vi.mock("../../../lib/simulation/clock", () => ({
  businessNow: () => new Date("2026-11-20T08:00:00Z"),
}));

describe("MyLibraryReservations", () => {
  it("invites the reader to search a title when self-service booking is enabled", () => {
    render(<MyLibraryReservations reservations={[]} bookingEnabled={true} />);

    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.getByText("emptyBody")).toBeInTheDocument();
    expect(screen.queryByText("bookingDisabled")).not.toBeInTheDocument();
  });

  // The page's other sections ("Sedang dipinjam", "Riwayat peminjaman")
  // title themselves above their card; holds used to put the title inside.
  it("titles the section above its card, like the page's other sections", () => {
    const { container } = render(<MyLibraryReservations reservations={[]} bookingEnabled />);

    const heading = screen.getByRole("heading", { name: "heading" });
    const section = container.querySelector("section");
    expect(section).toContainElement(heading);
    expect(heading.closest("[data-slot='card']")).toBeNull();
  });

  it("does not invite the reader to search when self-service booking is disabled, and explains why instead", () => {
    render(<MyLibraryReservations reservations={[]} bookingEnabled={false} />);

    expect(screen.queryByText("emptyBody")).not.toBeInTheDocument();
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.getByText("bookingDisabled")).toBeInTheDocument();
  });

  it("renders a reservation's title from the field GET /v1/library/me already joins in, without a separate titles lookup", () => {
    render(
      <MyLibraryReservations
        reservations={[
          {
            id: "res-1",
            title_id: "title-1",
            member_user_id: "member-1",
            status: "waiting",
            requested_at: "2026-01-01T00:00:00Z",
            title_name: "Laskar Pelangi",
            title_author: "Andrea Hirata",
          },
        ]}
        bookingEnabled={true}
      />,
    );

    expect(screen.getByText("Laskar Pelangi")).toBeInTheDocument();
  });

  it("shows a readable placeholder, not the raw title id, when title_name is absent", () => {
    render(
      <MyLibraryReservations
        reservations={[
          {
            id: "res-2",
            title_id: "title-2",
            member_user_id: "member-1",
            status: "waiting",
            requested_at: "2026-01-01T00:00:00Z",
          },
        ]}
        bookingEnabled={true}
      />,
    );

    expect(screen.getByText("titleUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("title-2")).not.toBeInTheDocument();
  });

  it("says until when a ready hold can be collected, and keeps it cancellable", () => {
    render(
      <MyLibraryReservations
        reservations={[
          {
            id: "res-3",
            title_id: "title-3",
            member_user_id: "member-1",
            status: "ready",
            requested_at: "2026-11-01T00:00:00Z",
            ready_at: "2026-11-20T07:40:00Z",
            expires_at: "2026-11-24T15:59:59Z",
            title_name: "Laskar Pelangi",
          },
        ]}
        bookingEnabled
      />,
    );

    expect(screen.getByText("status.ready")).toBeInTheDocument();
    expect(screen.getByText("pickupBy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cancel" })).toBeInTheDocument();
  });

  // The expiry job releases a lapsed hold on its next run; until then the
  // row must not still invite the member to collect it.
  it("shows a hold past its pickup deadline as expired, not ready, and offers no cancel", () => {
    render(
      <MyLibraryReservations
        reservations={[
          {
            id: "res-4",
            title_id: "title-4",
            member_user_id: "member-1",
            status: "ready",
            requested_at: "2026-11-01T00:00:00Z",
            ready_at: "2026-11-16T01:00:00Z",
            expires_at: "2026-11-18T15:59:59Z",
            title_name: "Sapiens",
          },
        ]}
        bookingEnabled
      />,
    );

    expect(screen.getByText("status.expired")).toBeInTheDocument();
    expect(screen.queryByText("status.ready")).not.toBeInTheDocument();
    expect(screen.getByText("pickupPassed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "cancel" })).not.toBeInTheDocument();
  });
});
