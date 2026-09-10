"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatCurrency, formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type Bill,
  type Payment,
  type StudentBillHistoryEntry,
  usePaymentReceiptUrlMutation,
  useStudentBillHistoryQuery,
} from "../api";

import { PaymentForm } from "./payment-form";
import { VoidPaymentDialog } from "./void-payment-dialog";

const METHOD_KEY: Record<Payment["method"], string> = {
  cash: "cash",
  bank_transfer: "bankTransfer",
  other: "other",
};

/**
 * One student's full billing picture: every bill this year with its
 * payments, a "Pay" action per outstanding bill, and a "Void" action per
 * payment -- the front desk's own view, reached by picking a student in
 * `PaymentDeskView`.
 */
export function StudentBillHistoryView({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canRecord = useCan("record_payments");
  const canVoid = useCan("void_payments");
  const { data, isLoading } = useStudentBillHistoryQuery(studentId);
  const receiptUrl = usePaymentReceiptUrlMutation();

  const [paying, setPaying] = useState<Bill | null>(null);
  const [voiding, setVoiding] = useState<{ payment: Payment; currency: string } | null>(null);

  const entries = data?.data ?? [];

  function downloadReceipt(paymentId: string) {
    receiptUrl.mutate(paymentId, {
      onSuccess: (result) => {
        window.open(result.url, "_blank", "noopener,noreferrer");
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.billing aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <BillCard
          key={entry.bill.id}
          entry={entry}
          canRecord={canRecord}
          canVoid={canVoid}
          onPay={() => {
            setPaying(entry.bill);
          }}
          onVoid={(payment) => {
            setVoiding({ payment, currency: entry.bill.currency });
          }}
          onDownloadReceipt={downloadReceipt}
        />
      ))}

      <Dialog
        open={paying !== null}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
      >
        <DialogContent title={t("paymentForm.title")}>
          {paying && (
            <PaymentForm
              bill={paying}
              onDone={() => {
                setPaying(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <VoidPaymentDialog
        payment={voiding?.payment ?? null}
        currency={voiding?.currency ?? "IDR"}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
      />
    </div>
  );
}

function BillCard({
  entry,
  canRecord,
  canVoid,
  onPay,
  onVoid,
  onDownloadReceipt,
}: {
  entry: StudentBillHistoryEntry;
  canRecord: boolean;
  canVoid: boolean;
  onPay: () => void;
  onVoid: (payment: Payment) => void;
  onDownloadReceipt: (paymentId: string) => void;
}): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const locale = useLocale() as Locale;
  const { bill, payments } = entry;
  const outstanding = bill.amount_minor - bill.paid_amount_minor;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[14px] font-medium text-fg">{bill.fee_type_name}</span>
          <span className="text-[13px] text-fg-muted">
            {bill.period} · {t("dueDate", { date: formatDate(bill.due_date, { locale }) })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-fg [font-variant-numeric:tabular-nums]">
            {formatCurrency(bill.amount_minor, bill.currency, { locale })}
          </span>
          <Badge variant={bill.status === "paid" ? "accent" : "neutral"}>
            {t(`status.${bill.status}`)}
          </Badge>
          {canRecord && outstanding > 0 && (
            <Button size="sm" onClick={onPay}>
              {t("pay")}
            </Button>
          )}
        </div>
      </div>
      {payments.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
            >
              <span className={payment.is_voided ? "text-fg-muted line-through" : "text-fg"}>
                {formatCurrency(payment.amount_minor, bill.currency, { locale })} ·{" "}
                {t(`method.${METHOD_KEY[payment.method]}`)} ·{" "}
                {formatDate(payment.paid_on, { locale })}
                {payment.reference ? ` · ${payment.reference}` : ""}
              </span>
              <span className="flex items-center gap-2">
                {payment.is_voided ? (
                  <span className="text-fg-muted">{t("voidedLabel")}</span>
                ) : (
                  <>
                    {payment.has_receipt && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onDownloadReceipt(payment.id);
                        }}
                      >
                        {t("receipt")}
                      </Button>
                    )}
                    {canVoid && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onVoid(payment);
                        }}
                      >
                        {t("void")}
                      </Button>
                    )}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
