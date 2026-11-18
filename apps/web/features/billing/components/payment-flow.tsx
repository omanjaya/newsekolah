"use client";

import { Button, DialogFooter, IconCircle } from "@newsekolah/ui";
import { CircleCheck, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import type { Bill, Payment } from "../api";
import { useBillingFormat } from "../lib/use-billing-format";
import { useReceipt } from "../lib/use-receipt";

import { PaymentForm } from "./payment-form";

/**
 * Recording a payment from start to finish, inside whatever dialog or
 * sheet hosts it: the form, then a confirmation with the amount large and
 * the receipt as the next step, since almost every payment at the counter
 * ends with one.
 */
export function PaymentFlow({ bill, onClose }: { bill: Bill; onClose: () => void }): ReactElement {
  const t = useTranslations("app.billing.paymentDesk.paymentDone");
  const { money } = useBillingFormat();
  const receipt = useReceipt();
  const [recorded, setRecorded] = useState<Payment | null>(null);

  if (!recorded) {
    return <PaymentForm bill={bill} onCancel={onClose} onRecorded={setRecorded} />;
  }

  const remainder = bill.amount_minor - bill.paid_amount_minor - recorded.amount_minor;
  return (
    <div className="flex flex-col gap-5">
      <div role="status" className="flex flex-col items-center gap-3 py-2 text-center">
        <IconCircle tone="success" size="xl">
          <CircleCheck />
        </IconCircle>
        <p className="text-body text-fg-muted">{t("title", { bill: bill.fee_type_name })}</p>
        <p className="text-display text-fg tabular-nums">
          {money(recorded.amount_minor, bill.currency)}
        </p>
        <p className="text-body-sm text-fg-muted">
          {remainder > 0
            ? t("remainder", { amount: money(remainder, bill.currency) })
            : t("settled")}
          {recorded.receipt_number
            ? ` · ${t("receiptNumber", { number: recorded.receipt_number })}`
            : ""}
        </p>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {t("done")}
        </Button>
        {recorded.has_receipt !== false && (
          <Button
            icon={<ReceiptText />}
            loading={receipt.pendingId === recorded.id}
            onClick={() => {
              receipt.open(recorded.id);
            }}
          >
            {t("receipt")}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
