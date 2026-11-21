import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import library from "../../../messages/features/library.id.json";
import type { LibraryViolation } from "../violations-api";

import { ViolationsView } from "./violations-view";

const suspension = {
  id: "v-suspend",
  member_user_id: "u1",
  kind: "damaged",
  penalty: "suspend",
  amount: 0,
  suspend_days: 3,
  status: "unpaid",
  created_at: "2026-11-21T03:00:00Z",
} as LibraryViolation;

vi.mock("next/navigation", () => ({
  usePathname: () => "/library/violations",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./library-workspace-nav", () => ({ LibraryWorkspaceNav: () => null }));
vi.mock("./violation-record-dialog", () => ({ ViolationRecordDialog: () => null }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
// The member is suspended through a day far ahead, so settling the
// suspension leaves it running.
vi.mock("../members-api", () => ({
  useLibraryMemberQuery: (userId: string) => ({
    data: userId
      ? {
          user_id: userId,
          member_no: "M-1",
          member_type_id: "t1",
          registered_on: "2026-01-01",
          status: "suspended",
          suspended_until: "2999-12-07",
          late_return_count: 1,
        }
      : undefined,
  }),
}));
vi.mock("../violations-api", () => ({
  useLibraryViolationsQuery: () => ({ data: { data: [suspension] }, isLoading: false }),
  useMemberViolationsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useSettleLibraryViolationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

describe("ViolationsView with the real catalog", () => {
  // The reported row: a 3-day suspension with nothing to pay, shown as
  // "Belum dibayar" with a "Tandai lunas" action.
  it("shows an unsettled suspension without money wording", async () => {
    window.history.replaceState(null, "", "/library/violations");
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider
        locale="id"
        timeZone="Asia/Makassar"
        messages={{ app: { library }, common: {} }}
        onError={(error) => {
          throw error;
        }}
      >
        <ViolationsView />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByText("Belum selesai").length).toBeGreaterThan(0);
    expect(screen.queryByText("Belum dibayar")).not.toBeInTheDocument();

    const menuButton = screen.getAllByRole("button", { name: /^Aksi untuk / })[0];
    if (!menuButton) throw new Error("Missing violation row actions menu");
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Tandai selesai" }));
    expect(screen.queryByText(/lunas/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Tandai selesai" })).toBeInTheDocument();
    // Settling does not lift a running suspension: the dialog says until
    // when, and no longer promises the member reactivates.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Penangguhan anggota tetap berjalan sampai 7 Des 2999/);
    expect(dialog).not.toHaveTextContent(/aktif kembali/);
  });
});
