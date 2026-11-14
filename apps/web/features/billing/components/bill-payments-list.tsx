"use client";

import { Badge, Button, List, ListRow, RowActionsMenu } from "@newsekolah/ui";
import { ReceiptText, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { Payment } from "../api";
import { useBillingFormat } from "../lib/use-billing-format";
import { useReceipt } from "../lib/use-receipt";

const METHOD_KEY: Record<Payment["method"], string> = {
  cash: "cash",
  bank_transfer: "bankTransfer",
  other: "other",
};

/**
 * The payments recorded against one bill, newest first as the API sends
 * them: the amount, how and when it was paid and its receipt number, the
 * receipt one tap away, and voiding (which asks for a reason) in the row's
 * menu. A voided payment stays listed, struck through, for the audit trail.
 */
export function BillPaymentsList({
  payments,
  currency,
  canVoid,
  onVoid,
}: {
  payments: Payment[];
  currency: string;
  canVoid: boolean;
  onVoid: (payment: Payment) => void;
}): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const { money, day } = useBillingFormat();
  const receipt = useReceipt();

  return (
    <List dense aria-label={t("paymentsTitle")}>
      {payments.map((payment) => {
        const amount = money(payment.amount_minor, currency);
        const meta = [
          t(`method.${METHOD_KEY[payment.method]}`),
          day(payment.paid_on),
          payment.receipt_number,
          payment.reference,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <ListRow
            key={payment.id}
            title={
              <span
                className={
                  payment.is_voided ? "text-fg-muted tabular-nums line-through" : "tabular-nums"
                }
              >
                {amount}
              </span>
            }
            meta={meta}
            trailing={
              payment.is_voided ? (
                <Badge size="sm" tone="neutral">
                  {t("voidedLabel")}
                </Badge>
              ) : undefined
            }
            action={
              payment.is_voided ? undefined : (
                <div className="flex items-center gap-1">
                  {payment.has_receipt && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ReceiptText />}
                      loading={receipt.pendingId === payment.id}
                      aria-label={t("receiptFor", { amount })}
                      onClick={() => {
                        receipt.open(payment.id);
                      }}
                    >
                      {t("receipt")}
                    </Button>
                  )}
                  {canVoid && (
                    <RowActionsMenu
                      ariaLabel={t("paymentActions", { amount })}
                      items={[
                        {
                          label: t("void"),
                          icon: <Undo2 />,
                          tone: "danger",
                          onClick: () => {
                            onVoid(payment);
                          },
                        },
                      ]}
                    />
                  )}
                </div>
              )
            }
          />
        );
      })}
    </List>
  );
}
