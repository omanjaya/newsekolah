import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn(), receipt: vi.fn(), share: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, string | number>): string =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../lib/receipt", () => ({ openOrShareReceipt: mocks.share }));
vi.mock("../api", () => ({
  today: () => "2026-11-14",
  useRecordPaymentMutation: () => ({ mutate: mocks.record, isPending: false }),
  usePaymentReceiptUrlMutation: () => ({ mutate: mocks.receipt, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { PaymentFlow } from "./payment-flow";

const bill = {
  id: "bill-1",
  student_user_id: "student-1",
  fee_type_id: "fee-1",
  fee_type_name: "SPP",
  currency: "IDR",
  period: "2026-11",
  due_date: "2026-11-10",
  original_amount_minor: 500000,
  discount_amount_minor: 0,
  amount_minor: 500000,
  paid_amount_minor: 200000,
  status: "partial" as const,
  generated_at: "2026-11-01T00:00:00Z",
};

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaymentFlow", () => {
  it("starts at the full remainder and records it as is", async () => {
    const user = userEvent.setup();
    render(<PaymentFlow bill={bill} onClose={vi.fn()} />);

    expect(screen.getByText("settlesBill")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ bill_id: "bill-1", amount_minor: 300000, method: "cash" }),
      expect.any(Object),
    );
  });

  it("refuses more than is left to pay, on the field, without recording", async () => {
    const user = userEvent.setup();
    render(<PaymentFlow bill={bill} onClose={vi.fn()} />);

    const amount = screen.getByRole("spinbutton", { name: "amount" });
    await user.clear(amount);
    await user.type(amount, "400000");
    expect(screen.getByText(/errors\.tooMuch/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("confirms the payment and offers its receipt as the next step", async () => {
    mocks.record.mockImplementation(
      (_body: unknown, options: { onSuccess: (payment: unknown) => void }) => {
        options.onSuccess({
          id: "payment-1",
          bill_id: "bill-1",
          amount_minor: 300000,
          method: "cash",
          paid_on: "2026-11-14",
          received_by_user_id: "u1",
          receipt_number: "KW-001",
          has_receipt: true,
          created_at: "2026-11-14T02:00:00Z",
          is_voided: false,
        });
      },
    );
    const user = userEvent.setup();
    render(<PaymentFlow bill={bill} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(screen.getByRole("status")).toHaveTextContent("settled");
    await user.click(screen.getByRole("button", { name: "receipt" }));
    expect(mocks.receipt).toHaveBeenCalledWith("payment-1", expect.any(Object));
  });
});
