import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MyLibraryReservations } from "./my-library-reservations";

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

describe("MyLibraryReservations", () => {
  it("invites the reader to search a title when self-service booking is enabled", () => {
    render(<MyLibraryReservations reservations={[]} bookingEnabled={true} />);

    expect(screen.getByText("emptyBody")).toBeInTheDocument();
    expect(screen.queryByText("bookingDisabled")).not.toBeInTheDocument();
  });

  it("does not invite the reader to search when self-service booking is disabled, and explains why instead", () => {
    render(<MyLibraryReservations reservations={[]} bookingEnabled={false} />);

    expect(screen.queryByText("emptyBody")).not.toBeInTheDocument();
    expect(screen.getByText("emptyBodyDisabled")).toBeInTheDocument();
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
});
