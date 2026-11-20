import type * as Ui from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpacReserveAction } from "./opac-reserve-action";

const session = vi.hoisted(() => vi.fn());
const can = vi.hoisted(() => vi.fn());
const profile = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: session,
  useCan: can,
}));
vi.mock("../me-api", () => ({
  useMyLibraryProfileQuery: profile,
  useReserveMyLibraryTitleMutation: () => ({ mutate: reserve, isPending: false }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof Ui>()),
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.date ? `${key} ${values.date} ${values.time}` : key,
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
// Fri 20 Nov 2026 16:00 WITA.
vi.mock("../../../lib/simulation/clock", () => ({
  businessNow: () => new Date("2026-11-20T08:00:00Z"),
}));

const signedIn = { status: "authenticated", isReady: true };

function myProfile(overrides: Record<string, unknown> = {}) {
  return {
    member: { user_id: "u1" },
    booking_enabled: true,
    reservations: [],
    active_loans: [],
    history: [],
    violations: [],
    ...overrides,
  };
}

describe("OpacReserveAction", () => {
  beforeEach(() => {
    reserve.mockReset();
    can.mockReturnValue(true);
    profile.mockReturnValue({ data: myProfile(), isError: false });
  });

  it("lets a signed-in member reserve the title from the catalogue", async () => {
    session.mockReturnValue(signedIn);
    reserve.mockImplementation((_titleId: string, options: { onSuccess: () => void }) => {
      options.onSuccess();
    });
    render(<OpacReserveAction titleId="t1" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "action" }));

    expect(reserve).toHaveBeenCalledWith("t1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledWith("done");
  });

  it("shows the reservation a member already has instead of a second one", () => {
    session.mockReturnValue(signedIn);
    profile.mockReturnValue({
      data: myProfile({
        reservations: [{ id: "r1", title_id: "t1", status: "ready" }],
      }),
      isError: false,
    });
    render(<OpacReserveAction titleId="t1" />);

    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "action" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "myLibrary" })).toHaveAttribute("href", "/library/me");
  });

  it("says until when a ready reservation is kept", () => {
    session.mockReturnValue(signedIn);
    profile.mockReturnValue({
      data: myProfile({
        reservations: [
          { id: "r1", title_id: "t1", status: "ready", expires_at: "2026-11-24T15:59:59Z" },
        ],
      }),
      isError: false,
    });
    render(<OpacReserveAction titleId="t1" />);

    expect(screen.getByText("readyBy 24 Nov 23.59")).toBeInTheDocument();
  });

  // The expiry job releases a lapsed hold on its next run; until then the
  // catalogue must not still tell the member it is ready.
  it("says a ready reservation's pickup deadline has passed", () => {
    session.mockReturnValue(signedIn);
    profile.mockReturnValue({
      data: myProfile({
        reservations: [
          { id: "r1", title_id: "t1", status: "ready", expires_at: "2026-11-18T01:00:00Z" },
        ],
      }),
      isError: false,
    });
    render(<OpacReserveAction titleId="t1" />);

    expect(screen.getByText("pickupPassed 18 Nov 09.00")).toBeInTheDocument();
    expect(screen.queryByText(/^ready/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "action" })).not.toBeInTheDocument();
  });

  it("points a reader who cannot book here to their library page", () => {
    session.mockReturnValue(signedIn);
    profile.mockReturnValue({ data: myProfile({ booking_enabled: false }), isError: false });
    render(<OpacReserveAction titleId="t1" />);

    expect(screen.queryByRole("button", { name: "action" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "myLibrary" })).toBeInTheDocument();
  });

  it("asks a visitor to sign in, coming back to the title", () => {
    session.mockReturnValue({ status: "unauthenticated", isReady: true });
    render(<OpacReserveAction titleId="t1" />);

    expect(screen.queryByRole("button", { name: "action" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "signIn" })).toHaveAttribute(
      "href",
      "/login?next=%2Fopac%2Ft1",
    );
  });
});
