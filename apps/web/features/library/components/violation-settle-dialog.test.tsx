import { ApiError } from "@newsekolah/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  member: undefined as
    { status: "active" | "suspended"; suspended_until?: string; valid_until?: string } | undefined,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error:${code}`,
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../members-api", () => ({
  useLibraryMemberQuery: () => ({ data: mocks.member }),
}));
vi.mock("../violations-api", () => ({
  useSettleLibraryViolationMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}));

import type { LibraryViolation } from "../violations-api";

import { ViolationSettleDialog } from "./violation-settle-dialog";

const violation = {
  id: "v1",
  member_user_id: "u1",
  kind: "late",
  penalty: "fine",
  amount: 75000,
  status: "unpaid",
} as LibraryViolation;

function renderDialog() {
  const handlers = { onSettled: vi.fn(), onAlreadySettled: vi.fn(), onOpenChange: vi.fn() };
  render(
    <ViolationSettleDialog
      violation={violation}
      status="paid"
      memberName="Siswa Dua"
      {...handlers}
    />,
  );
  return handlers;
}

describe("ViolationSettleDialog", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.member = undefined;
  });

  // Both clicks of a double click land before the mutation's pending state
  // reaches the button, so neither may wait for a re-render to be ignored.
  it("records one payment for two clicks in the same tick", () => {
    renderDialog();
    const confirm = screen.getByRole("button", { name: "markPaid" });

    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });

  it("closes without an error when the violation was already settled", () => {
    mocks.mutate.mockImplementation((_vars: unknown, opts: { onError: (e: unknown) => void }) => {
      opts.onError(
        new ApiError({ status: 409, code: "LIBRARY_VIOLATION_ALREADY_SETTLED", message: "done" }),
      );
    });
    const handlers = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "markPaid" }));

    expect(handlers.onAlreadySettled).toHaveBeenCalledTimes(1);
    expect(handlers.onSettled).not.toHaveBeenCalled();
    expect(screen.queryByText("error:LIBRARY_VIOLATION_ALREADY_SETTLED")).not.toBeInTheDocument();
  });

  it("keeps other failures in the dialog", () => {
    mocks.mutate.mockImplementation((_vars: unknown, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "boom" }));
    });
    const handlers = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "markPaid" }));

    expect(screen.getByText("error:INTERNAL_ERROR")).toBeInTheDocument();
    expect(handlers.onAlreadySettled).not.toHaveBeenCalled();
  });

  // Settling a suspension is not a payment: no "Tandai lunas" anywhere.
  it("marks a suspension settled, not paid, and hands the violation back", () => {
    mocks.mutate.mockImplementation((_vars: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    const suspension = { ...violation, penalty: "suspend", amount: 0 } as LibraryViolation;
    const handlers = { onSettled: vi.fn(), onAlreadySettled: vi.fn(), onOpenChange: vi.fn() };
    render(
      <ViolationSettleDialog
        violation={suspension}
        status="paid"
        memberName="Siswa Dua"
        {...handlers}
      />,
    );

    expect(screen.getByText("confirmDoneTitle")).toBeInTheDocument();
    expect(screen.getByText("confirmDoneBody")).toBeInTheDocument();
    expect(screen.queryByText("confirmPaidTitle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "markPaid" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "markDone" }));

    expect(mocks.mutate).toHaveBeenCalledWith(
      { violationId: "v1", status: "paid" },
      expect.anything(),
    );
    expect(handlers.onSettled).toHaveBeenCalledWith("paid", suspension);
  });

  // The dialog promised "the member reactivates once every violation is
  // settled", but settling leaves a running suspension in place.
  describe("what settling leaves of a suspension", () => {
    const suspension = { ...violation, penalty: "suspend", amount: 0 } as LibraryViolation;

    function renderSettle(target: LibraryViolation, status: "paid" | "waived" = "paid") {
      render(
        <ViolationSettleDialog
          violation={target}
          status={status}
          memberName="Siswa Dua"
          onSettled={vi.fn()}
          onAlreadySettled={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
    }

    it("says a running suspension keeps its last day", () => {
      mocks.member = { status: "suspended", suspended_until: "2999-12-07" };
      renderSettle(suspension);
      expect(screen.getByText("suspensionKeepsRunning")).toBeInTheDocument();
    });

    it("says so on a waiver too", () => {
      mocks.member = { status: "suspended", suspended_until: "2999-12-07" };
      renderSettle(suspension, "waived");
      expect(screen.getByText("suspensionKeepsRunning")).toBeInTheDocument();
    });

    it("says so when a fine is paid during a suspension", () => {
      mocks.member = { status: "suspended", suspended_until: "2999-12-07" };
      renderSettle(violation);
      expect(screen.getByText("confirmPaidBodyAmount")).toBeInTheDocument();
      expect(screen.getByText("suspensionKeepsRunning")).toBeInTheDocument();
    });

    it("says a suspension with no end date stays until staff change it", () => {
      mocks.member = { status: "suspended" };
      renderSettle(violation);
      expect(screen.getByText("suspensionKeepsRunningOpen")).toBeInTheDocument();
    });

    it("still says a suspension is not ended early before the member loads", () => {
      renderSettle(suspension);
      expect(screen.getByText("suspensionNotLifted")).toBeInTheDocument();
    });

    it("mentions no suspension once it is over", () => {
      mocks.member = { status: "suspended", suspended_until: "2000-01-07" };
      renderSettle(suspension);
      expect(screen.queryByText(/^suspension/)).not.toBeInTheDocument();
    });

    it("mentions no suspension for a fine of an active member", () => {
      mocks.member = { status: "active" };
      renderSettle(violation);
      expect(screen.queryByText(/^suspension/)).not.toBeInTheDocument();
    });
  });
});
