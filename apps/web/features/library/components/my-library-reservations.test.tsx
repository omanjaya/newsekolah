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

vi.mock("./library-title-name", () => ({
  LibraryTitleName: ({ titleId }: { titleId: string }) => <>{titleId}</>,
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
});
