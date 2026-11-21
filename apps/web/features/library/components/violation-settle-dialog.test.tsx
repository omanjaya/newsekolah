import { ApiError } from "@newsekolah/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error:${code}`,
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
});
