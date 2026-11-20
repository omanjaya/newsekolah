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
  useTranslations: () => (key: string) => key,
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
