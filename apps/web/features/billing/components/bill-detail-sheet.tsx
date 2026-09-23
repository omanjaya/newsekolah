"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatCurrency, formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  Sheet,
  SheetContent,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type Payment,
  useBillQuery,
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
 * One bill's detail, reached from the bills list: the bill's own fields
 * plus the payments recorded against it. The API has no
 * "payments for this bill" endpoint, so payments come from the same
 * student's bill history (`StudentBillHistoryEntry`) and are filtered down
 * to this bill's id -- the same data `StudentBillHistoryView` already
 * fetches for the front desk, just scoped to a single bill here.
 */
export function BillDetailSheet({
  billId,
  onOpenChange,
}: {
  billId: string | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.billing.bills");
  const tDesk = useTranslations("app.billing.paymentDesk");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canRecord = useCan("record_payments");
  const canVoid = useCan("void_payments");

  const { data: bill, isLoading, isError, refetch } = useBillQuery(billId);
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const history = useStudentBillHistoryQuery(bill?.student_user_id ?? "", !!bill);
  const receiptUrl = usePaymentReceiptUrlMutation();

  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  const payments = history.data?.data.find((entry) => entry.bill.id === billId)?.payments ?? [];
  const outstanding = bill ? bill.amount_minor - bill.paid_amount_minor : 0;
  const studentName = bill
    ? (studentMap.get(bill.student_user_id)?.name ?? bill.student_user_id)
    : "";

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

  return (
    <Sheet
      open={billId !== null}
      onOpenChange={(open) => {
        if (!open) setPaying(false);
        onOpenChange(open);
      }}
    >
      <SheetContent title={t("detailTitle")} className="md:mx-auto md:w-[28rem]">
        {isError ? (
          <QueryError retry={refetch} />
        ) : isLoading || !bill ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-medium text-fg">{bill.fee_type_name}</span>
              <span className="text-[13px] text-fg-muted">{studentName}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-fg-muted">{t("columns.period")}</dt>
              <dd className="text-fg">{bill.period}</dd>
              <dt className="text-fg-muted">{t("columns.dueDate")}</dt>
              <dd className="text-fg">{formatDate(bill.due_date, { locale })}</dd>
              <dt className="text-fg-muted">{t("status.label")}</dt>
              <dd>
                <Badge variant={bill.status === "paid" ? "accent" : "neutral"}>
                  {t(`status.${bill.status}`)}
                </Badge>
              </dd>
              <dt className="text-fg-muted">{t("originalAmount")}</dt>
              <dd className="tabular-nums text-fg">
                {formatCurrency(bill.original_amount_minor, bill.currency, { locale })}
              </dd>
              <dt className="text-fg-muted">{t("discountAmount")}</dt>
              <dd className="tabular-nums text-fg">
                {formatCurrency(bill.discount_amount_minor, bill.currency, { locale })}
              </dd>
              <dt className="text-fg-muted">{t("billAmount")}</dt>
              <dd className="tabular-nums font-medium text-fg">
                {formatCurrency(bill.amount_minor, bill.currency, { locale })}
              </dd>
              <dt className="text-fg-muted">{t("paidAmount")}</dt>
              <dd className="tabular-nums text-fg">
                {formatCurrency(bill.paid_amount_minor, bill.currency, { locale })}
              </dd>
            </dl>

            {canRecord && outstanding > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setPaying(true);
                }}
              >
                {tDesk("pay")}
              </Button>
            )}

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <h3 className="text-[13px] font-medium text-fg">{t("paymentsTitle")}</h3>
              {history.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : payments.length === 0 ? (
                <p className="text-[13px] text-fg-muted">{t("noPayments")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-col gap-1 rounded-xs border border-border p-2 text-[13px]"
                    >
                      <span
                        className={payment.is_voided ? "text-fg-muted line-through" : "text-fg"}
                      >
                        {formatCurrency(payment.amount_minor, bill.currency, { locale })} ·{" "}
                        {tDesk(`method.${METHOD_KEY[payment.method]}`)} ·{" "}
                        {formatDate(payment.paid_on, { locale })}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        {payment.is_voided ? (
                          <span className="text-fg-muted">{tDesk("voidedLabel")}</span>
                        ) : (
                          <>
                            {payment.has_receipt && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  downloadReceipt(payment.id);
                                }}
                              >
                                {tDesk("receipt")}
                              </Button>
                            )}
                            {canVoid && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setVoiding(payment);
                                }}
                              >
                                {tDesk("void")}
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
          </div>
        )}
      </SheetContent>

      {bill && (
        <Dialog open={paying} onOpenChange={setPaying}>
          <DialogContent title={tDesk("paymentForm.title")}>
            <PaymentForm
              bill={bill}
              onDone={() => {
                setPaying(false);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      <VoidPaymentDialog
        payment={voiding}
        currency={bill?.currency ?? "IDR"}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
      />
    </Sheet>
  );
}
