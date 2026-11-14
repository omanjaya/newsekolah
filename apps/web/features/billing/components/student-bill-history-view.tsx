"use client";

import {
  Avatar,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Dialog,
  DialogContent,
  EmptyState,
  Progress,
  SectionHeader,
  SkeletonCards,
  SkeletonList,
  Stat,
  StatGrid,
  domainIcons,
} from "@newsekolah/ui";
import { AlarmClock, Banknote, CircleCheck, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import {
  type Bill,
  type Payment,
  type StudentBillHistoryEntry,
  useStudentBillHistoryQuery,
} from "../api";
import { billDisplayStatus } from "../lib/bill-status";
import { useBillingFormat } from "../lib/use-billing-format";

import { BillPaymentsList } from "./bill-payments-list";
import { BillStatusBadge } from "./bill-status-badge";
import { PaymentFlow } from "./payment-flow";
import { VoidPaymentDialog } from "./void-payment-dialog";

/** Urgent bills (overdue, then partial, then not-yet-due unpaid) float above paid ones, most urgent first. */
const DISPLAY_ORDER: Record<ReturnType<typeof billDisplayStatus>, number> = {
  overdue: 0,
  partial: 1,
  unpaid: 2,
  paid: 3,
};

/**
 * One student at the payment desk: who they are, what is left to pay, how
 * much of it is overdue and what was already paid, then every bill this
 * year with the most urgent first, each with its remainder large, its
 * payments and the "Bayar" action. A failed load says so and offers a
 * retry; it never reads as "no bills".
 */
export function StudentBillHistoryView({
  studentId,
  studentName,
  studentNis,
}: {
  studentId: string;
  studentName: string;
  studentNis?: string;
}): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const canRecord = useCan("record_payments");
  const canVoid = useCan("void_payments");
  const { me } = useSession();
  const { money } = useBillingFormat();
  const { data, isLoading, isError, error, refetch } = useStudentBillHistoryQuery(studentId);

  const [paying, setPaying] = useState<Bill | null>(null);
  const [voiding, setVoiding] = useState<{ payment: Payment; currency: string } | null>(null);

  const today = todayInZone(me?.tenant.timezone);
  const entries = useMemo(() => {
    const list = data?.data ?? [];
    return [...list].sort(
      (a, b) =>
        DISPLAY_ORDER[billDisplayStatus(a.bill, today)] -
        DISPLAY_ORDER[billDisplayStatus(b.bill, today)],
    );
  }, [data, today]);

  const summary = useMemo(() => {
    let outstanding = 0;
    let paid = 0;
    let overdueCount = 0;
    let currency = "IDR";
    for (const entry of data?.data ?? []) {
      currency = entry.bill.currency;
      outstanding += entry.bill.amount_minor - entry.bill.paid_amount_minor;
      paid += entry.bill.paid_amount_minor;
      if (billDisplayStatus(entry.bill, today) === "overdue") overdueCount += 1;
    }
    return { outstanding, paid, overdueCount, currency };
  }, [data, today]);

  const identity = (
    <div className="flex items-center gap-3">
      <Avatar name={studentName} size={48} decorative />
      <SectionHeader
        className="min-w-0 flex-1"
        title={studentName}
        description={studentNis ? t("nis", { nis: studentNis }) : undefined}
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {identity}
        <SkeletonCards count={3} className="grid-cols-1 sm:grid-cols-3" />
        <SkeletonList rows={3} leading={false} />
      </div>
    );
  }

  // A failed read must never look like "this student has no bills".
  if (isError && !data) {
    return (
      <div className="flex flex-col gap-6">
        {identity}
        <QueryError retry={() => refetch()} error={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {identity}
      {entries.length === 0 ? (
        <EmptyState
          icon={<domainIcons.billing />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <>
          <StatGrid variant="strip" aria-label={t("summaryLabel")}>
            <Stat
              icon={<Wallet />}
              tone="blue"
              label={t("totalOutstanding")}
              value={
                <span className="tabular-nums">{money(summary.outstanding, summary.currency)}</span>
              }
            />
            <Stat
              icon={<AlarmClock />}
              tone={summary.overdueCount > 0 ? "red" : "green"}
              label={t("overdueCount")}
              value={t("billsCount", { count: summary.overdueCount })}
            />
            <Stat
              icon={<CircleCheck />}
              tone="green"
              label={t("paidTotal")}
              value={<span className="tabular-nums">{money(summary.paid, summary.currency)}</span>}
            />
          </StatGrid>
          <section className="flex flex-col gap-3">
            <SectionHeader title={t("billsTitle")} count={entries.length} />
            <ul className="flex flex-col gap-3">
              {entries.map((entry) => (
                <li key={entry.bill.id}>
                  <BillCard
                    entry={entry}
                    canRecord={canRecord}
                    canVoid={canVoid}
                    onPay={() => {
                      setPaying(entry.bill);
                    }}
                    onVoid={(payment) => {
                      setVoiding({ payment, currency: entry.bill.currency });
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Dialog
        open={paying !== null}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
      >
        <DialogContent title={t("paymentForm.title")}>
          {paying && (
            <PaymentFlow
              bill={paying}
              onClose={() => {
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

/**
 * One bill at the desk: what it is for and when it falls due, its status,
 * the remainder as the card's figure (with the total beside a progress bar
 * once part is paid), the pay action, and the payments made so far.
 */
function BillCard({
  entry,
  canRecord,
  canVoid,
  onPay,
  onVoid,
}: {
  entry: StudentBillHistoryEntry;
  canRecord: boolean;
  canVoid: boolean;
  onPay: () => void;
  onVoid: (payment: Payment) => void;
}): ReactElement {
  const t = useTranslations("app.billing.paymentDesk");
  const { money, day } = useBillingFormat();
  const { bill, payments } = entry;
  const outstanding = bill.amount_minor - bill.paid_amount_minor;
  const partlyPaid = bill.paid_amount_minor > 0 && outstanding > 0;

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{bill.fee_type_name}</CardTitle>
          <CardDescription>
            {t("billMeta", { period: bill.period, date: day(bill.due_date) })}
          </CardDescription>
        </div>
        <BillStatusBadge bill={bill} namespace="app.billing.paymentDesk" />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body-sm text-fg-muted">
            {outstanding > 0 ? t("remaining") : t("billAmount")}
          </span>
          <span className="text-title-lg text-fg tabular-nums">
            {money(outstanding > 0 ? outstanding : bill.amount_minor, bill.currency)}
          </span>
          {partlyPaid && (
            <span className="text-body-sm text-fg-muted tabular-nums">
              {t("ofTotal", { amount: money(bill.amount_minor, bill.currency) })}
            </span>
          )}
        </div>
        {canRecord && outstanding > 0 && (
          <Button icon={<Banknote />} onClick={onPay} className="w-full sm:w-auto">
            {t("pay")}
          </Button>
        )}
      </div>
      {partlyPaid && (
        <Progress
          value={bill.paid_amount_minor}
          max={bill.amount_minor}
          tone="success"
          aria-label={t("paidShare", { amount: money(bill.paid_amount_minor, bill.currency) })}
        />
      )}
      {payments.length > 0 && (
        <>
          <p className="text-label text-fg-muted">{t("paymentsTitle")}</p>
          <BillPaymentsList
            payments={payments}
            currency={bill.currency}
            canVoid={canVoid}
            onVoid={onVoid}
          />
        </>
      )}
    </Card>
  );
}
