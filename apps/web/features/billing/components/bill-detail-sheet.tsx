"use client";

import {
  Button,
  DataList,
  DataListItem,
  EmptyState,
  Progress,
  SectionHeader,
  Sheet,
  SheetContent,
  SkeletonDetail,
} from "@newsekolah/ui";
import { Banknote, ReceiptText, Store } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { type Payment, useBillQuery, useStudentBillHistoryQuery } from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

import { BillPaymentsList } from "./bill-payments-list";
import { BillStatusBadge } from "./bill-status-badge";
import { PaymentFlow } from "./payment-flow";
import { VoidPaymentDialog } from "./void-payment-dialog";

/**
 * One bill's detail, reached from the bills list, as a drawer beside the
 * table on a desktop and a bottom sheet on a phone: what is left to pay
 * as its figure, how the amount was built (discounts included), and the
 * payments made against it. Paying happens in the same sheet, not in a
 * second layer on top of it. The API has no "payments for this bill"
 * endpoint, so payments come from the student's bill history, narrowed to
 * this bill.
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
  const canRecord = useCan("record_payments");
  const canVoid = useCan("void_payments");
  const { money, day } = useBillingFormat();

  const { data: bill, isLoading, isError, error, refetch } = useBillQuery(billId);
  const studentMap = useDirectoryNames([bill?.student_user_id]);
  const history = useStudentBillHistoryQuery(bill?.student_user_id ?? "", !!bill);

  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  const payments = history.data?.data.find((entry) => entry.bill.id === billId)?.payments ?? [];
  const outstanding = bill ? bill.amount_minor - bill.paid_amount_minor : 0;
  const studentName = bill
    ? (studentMap.get(bill.student_user_id)?.name ?? t("unknownStudent"))
    : "";

  let body: ReactElement;
  if (isError && !bill) {
    body = <QueryError retry={() => refetch()} error={error} />;
  } else if (isLoading || !bill) {
    body = <SkeletonDetail rows={5} />;
  } else if (paying) {
    body = (
      <PaymentFlow
        bill={bill}
        onClose={() => {
          setPaying(false);
        }}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-heading text-fg">{bill.fee_type_name}</p>
              <p className="text-body-sm text-fg-muted">
                {studentName} · {bill.period}
              </p>
            </div>
            <BillStatusBadge bill={bill} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-body-sm text-fg-muted">
              {outstanding > 0 ? tDesk("remaining") : t("billAmount")}
            </span>
            <span className="text-title-lg text-fg tabular-nums">
              {money(outstanding > 0 ? outstanding : bill.amount_minor, bill.currency)}
            </span>
          </div>
          {bill.paid_amount_minor > 0 && outstanding > 0 && (
            <Progress
              value={bill.paid_amount_minor}
              max={bill.amount_minor}
              tone="success"
              aria-label={tDesk("paidShare", {
                amount: money(bill.paid_amount_minor, bill.currency),
              })}
            />
          )}
        </div>
        <DataList>
          <DataListItem label={t("columns.dueDate")}>{day(bill.due_date)}</DataListItem>
          <DataListItem label={t("originalAmount")}>
            <span className="tabular-nums">{money(bill.original_amount_minor, bill.currency)}</span>
          </DataListItem>
          <DataListItem label={t("discountAmount")}>
            <span className="tabular-nums">{money(bill.discount_amount_minor, bill.currency)}</span>
          </DataListItem>
          <DataListItem label={t("billAmount")}>
            <span className="font-semibold tabular-nums">
              {money(bill.amount_minor, bill.currency)}
            </span>
          </DataListItem>
          <DataListItem label={t("paidAmount")}>
            <span className="tabular-nums">{money(bill.paid_amount_minor, bill.currency)}</span>
          </DataListItem>
        </DataList>
        <section className="flex flex-col gap-3">
          <SectionHeader as="h3" title={t("paymentsTitle")} count={payments.length} />
          {history.isLoading ? (
            <SkeletonDetail rows={2} />
          ) : payments.length === 0 ? (
            <EmptyState variant="compact" icon={<ReceiptText />} title={t("noPayments")} />
          ) : (
            <BillPaymentsList
              payments={payments}
              currency={bill.currency}
              canVoid={canVoid}
              onVoid={setVoiding}
            />
          )}
        </section>
      </div>
    );
  }

  const showFooter = bill !== undefined && !paying;
  return (
    <Sheet
      open={billId !== null}
      onOpenChange={(open) => {
        if (!open) setPaying(false);
        onOpenChange(open);
      }}
    >
      <SheetContent
        side="right"
        title={paying ? tDesk("paymentForm.title") : t("detailTitle")}
        footer={
          showFooter ? (
            <>
              <Button asChild variant="secondary" icon={<Store />}>
                <Link href={`/billing?tab=desk&student=${bill.student_user_id}`}>
                  {t("openAtDesk")}
                </Link>
              </Button>
              {canRecord && outstanding > 0 && (
                <Button
                  icon={<Banknote />}
                  onClick={() => {
                    setPaying(true);
                  }}
                >
                  {tDesk("pay")}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {body}
      </SheetContent>

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
