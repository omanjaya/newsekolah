import { ApiError } from "@newsekolah/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as KioskSessionModule from "../kiosk-session";
import {
  PRINTED_CARD_CODE_FIELDS,
  matchMemberByCode,
  type MemberCodeField,
} from "../lib/member-code-match";

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
const lookupFields = vi.fn();
vi.mock("../desk-api", () => ({
  useFindMemberByCodeMutation: (fields: readonly MemberCodeField[]) => {
    lookupFields(fields);
    return {
      mutateAsync: (code: string) => findMemberByCode(code, fields) as Promise<unknown>,
      isPending: false,
    };
  },
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
    lookupFields.mockReset();
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
    expect(findMemberByCode).toHaveBeenCalledWith("SEED-SISWA-01", PRINTED_CARD_CODE_FIELDS);
  });

  it.each(["2024001", "siti"])(
    "does not open a classmate's session from their NIS or username (%s)",
    async (code) => {
      const classmate = {
        user_id: MEMBER_USER_ID,
        member_no: "SEED-SISWA-01",
        nis: "2024001",
        username: "siti",
      };
      // The lookup really returns the classmate; only the matching decides.
      findMemberByCode.mockImplementation((typed: string, fields: readonly MemberCodeField[]) =>
        Promise.resolve(matchMemberByCode([classmate], typed, fields)),
      );
      render(<KioskView />);

      scanCard(code);

      expect(await screen.findByText("feedback.unknownCard")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "idle.title" })).toBeInTheDocument();
      expect(lookupFields).toHaveBeenLastCalledWith(PRINTED_CARD_CODE_FIELDS);
    },
  );

  it("shows the API error, not an unknown card, when the lookup request fails", async () => {
    findMemberByCode.mockRejectedValue(
      new ApiError({ status: 403, code: "FORBIDDEN", message: "forbidden" }),
    );
    render(<KioskView />);

    scanCard("SEED-SISWA-01");

    expect(await screen.findByText("FORBIDDEN")).toBeInTheDocument();
    expect(screen.queryByText("feedback.unknownCard")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "idle.title" })).toBeInTheDocument();
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
