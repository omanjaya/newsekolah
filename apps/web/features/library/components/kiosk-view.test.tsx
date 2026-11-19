import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as KioskSessionModule from "../kiosk-session";

import { KioskView } from "./kiosk-view";

const findMemberByCode = vi.fn();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Jakarta" }));
vi.mock("../api", () => ({
  useBorrowLoanMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useReturnLoanMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../desk-api", () => ({
  useFindMemberByCodeMutation: () => ({ mutateAsync: findMemberByCode, isPending: false }),
}));
vi.mock("../kiosk-session", async (importOriginal) => {
  const actual = await importOriginal<typeof KioskSessionModule>();
  return {
    looksLikeMemberUserId: actual.looksLikeMemberUserId,
    useKioskMemberSession: () => ({ findLoanForBarcode: () => undefined }),
  };
});
vi.mock("./kiosk-member-panel", () => ({ KioskMemberPanel: () => null }));

const MEMBER_USER_ID = "01a1f05e-47dc-4f7b-9a43-1c1a2b3c4d5e";

function scanCard(code: string) {
  fireEvent.change(screen.getByLabelText("idle.scanLabel"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "idle.submit" }));
}

describe("KioskView", () => {
  beforeEach(() => {
    findMemberByCode.mockReset();
  });

  it("titles the idle screen with the page heading, like the visit kiosk", () => {
    render(<KioskView />);
    expect(screen.getByRole("heading", { level: 1, name: "idle.title" })).toBeInTheDocument();
  });

  it("opens a session for the member number printed on the card", async () => {
    findMemberByCode.mockResolvedValue({
      status: "found",
      member: { user_id: MEMBER_USER_ID, member_no: "SEED-SISWA-01" },
    });
    render(<KioskView />);

    scanCard("SEED-SISWA-01");

    expect(
      await screen.findByRole("heading", { level: 1, name: "active.title" }),
    ).toBeInTheDocument();
    expect(findMemberByCode).toHaveBeenCalledWith("SEED-SISWA-01");
  });

  it("opens a session for a raw user ID without a lookup", async () => {
    render(<KioskView />);

    scanCard(MEMBER_USER_ID);

    expect(
      await screen.findByRole("heading", { level: 1, name: "active.title" }),
    ).toBeInTheDocument();
    expect(findMemberByCode).not.toHaveBeenCalled();
  });

  it.each(["none", "ambiguous"] as const)(
    "says the card is not recognized when the lookup finds %s",
    async (status) => {
      findMemberByCode.mockResolvedValue({ status });
      render(<KioskView />);

      scanCard("UNKNOWN-01");

      expect(await screen.findByText("feedback.unknownCard")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "idle.title" })).toBeInTheDocument();
    },
  );

  it("looks a card up once when it is read twice during the lookup", async () => {
    let resolveLookup: (value: unknown) => void = () => undefined;
    findMemberByCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );
    render(<KioskView />);

    scanCard("SEED-SISWA-01");
    scanCard("SEED-SISWA-02");
    await waitFor(() => {
      expect(findMemberByCode).toHaveBeenCalledTimes(1);
    });
    resolveLookup({ status: "found", member: { user_id: MEMBER_USER_ID } });

    expect(
      await screen.findByRole("heading", { level: 1, name: "active.title" }),
    ).toBeInTheDocument();
    expect(findMemberByCode).toHaveBeenCalledTimes(1);
  });
});
