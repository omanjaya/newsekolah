"use client";

import { type Locale, formatCurrency, formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  domainIcons,
} from "@newsekolah/ui";
import { FileText, GraduationCap, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useGuardianLeaveQueueQuery } from "../../permits/api";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import {
  currentMonth,
  useChildAttendanceQuery,
  useChildBillingQuery,
  useChildDisciplineQuery,
  useChildGradesQuery,
  useMyChildrenQuery,
  type LinkedChild,
} from "../api";

const ATTENDANCE_CODES = ["H", "S", "I", "D", "A"];

/**
 * A parent's own children: a picker (when there is more than one), then
 * that child's attendance for the selected month, published grades, and
 * discipline record. Only what has been published is shown (docs/07-ui-ux.md
 * section 5); nothing here implies a judgement the data does not carry.
 */
export function ChildrenView(): ReactElement {
  const t = useTranslations("app.family.myChildren");
  const children = useMyChildrenQuery();
  const rows = children.data?.data ?? [];
  const [studentId, setStudentId] = useState("");
  const effectiveId = studentId || (rows[0]?.student_user_id ?? "");
  const selected = rows.find((c) => c.student_user_id === effectiveId);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <PendingApprovalsBanner />

      {children.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : children.error ? (
        <Alert variant="warning" title={t("loadError")} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {rows.length > 1 && (
            <Select
              options={rows.map((c) => ({ value: c.student_user_id, label: c.student_name }))}
              value={effectiveId}
              onValueChange={setStudentId}
              aria-label={t("pickChild")}
              className="w-64"
            />
          )}
          {selected && <ChildSections child={selected} />}
        </div>
      )}
    </div>
  );
}

/**
 * A guardian's shortcut to their pending leave-request approvals, shown
 * only once there is something waiting -- this screen is about the
 * child's record, not a second inbox, so it stays silent otherwise.
 */
function PendingApprovalsBanner(): ReactElement | null {
  const t = useTranslations("app.family.myChildren.pendingApprovals");
  const canApproveAsGuardian = useCan("approve_child_leave_requests");
  const queue = useGuardianLeaveQueueQuery(canApproveAsGuardian);
  const count = queue.data?.data.length ?? 0;

  if (!canApproveAsGuardian || count === 0) return null;

  return (
    <Alert variant="warning" title={t("title", { count })}>
      <Link href="/leave-requests" className="underline underline-offset-2">
        {t("link")}
      </Link>
    </Alert>
  );
}

function ChildSections({ child }: { child: LinkedChild }): ReactElement {
  const canSeeGrades = useCan("view_child_grades");
  const canSeeBilling = useCan("view_child_billing");
  const [month, setMonth] = useState(currentMonth());
  const attendance = useChildAttendanceQuery(child.student_user_id, month);
  const grades = useChildGradesQuery(child.student_user_id);
  const discipline = useChildDisciplineQuery(child.student_user_id);
  const billing = useChildBillingQuery(canSeeBilling ? child.student_user_id : "");

  return (
    <div className="flex flex-col gap-6">
      <AttendanceSection month={month} onMonthChange={setMonth} query={attendance} />
      {canSeeGrades && <GradesSection query={grades} />}
      <DisciplineSection query={discipline} />
      {canSeeBilling && <BillingSection query={billing} />}
    </div>
  );
}

function AttendanceSection({
  month,
  onMonthChange,
  query,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  query: ReturnType<typeof useChildAttendanceQuery>;
}): ReactElement {
  const t = useTranslations("app.family.myChildren.attendance");
  const totals = query.data?.totals ?? {};
  const incomplete = (query.data?.data ?? []).filter((d) => !d.complete).length;
  const total = Object.values(totals).reduce((sum, n) => sum + n, 0);

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        <Input
          type="month"
          value={month}
          onChange={(e) => {
            onMonthChange(e.target.value);
          }}
          aria-label={t("pickMonth")}
          className="w-40"
        />
      </div>
      {query.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : total === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("empty")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            {ATTENDANCE_CODES.filter((code) => totals[code]).map((code) => (
              <span key={code} className="text-[13px] text-fg [font-variant-numeric:tabular-nums]">
                {t(`codes.${code}`)}: {totals[code]}
              </span>
            ))}
          </div>
          <p className="border-t border-border pt-2 text-[13px] text-fg-muted">
            {t("incomplete", { count: incomplete })}
          </p>
        </>
      )}
    </section>
  );
}

function GradesSection({ query }: { query: ReturnType<typeof useChildGradesQuery> }): ReactElement {
  const t = useTranslations("app.family.myChildren.grades");
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);
  const rows = query.data?.subjects ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        {query.data && (
          <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
            <Star className="size-4" aria-hidden="true" />
            {t("stars", { count: query.data.stars })}
          </span>
        )}
      </div>
      {query.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<GraduationCap aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((subject) => (
            <li
              key={subject.subject_id}
              className="flex items-center justify-between gap-2 text-[13px]"
            >
              <span className="text-fg">
                {subjectMap.get(subject.subject_id)?.name ?? t("unknownSubject")}
              </span>
              <span className="text-fg-muted [font-variant-numeric:tabular-nums]">
                {subject.average !== undefined &&
                  t("average", { score: subject.average.toFixed(1) })}
                {subject.report_score !== undefined &&
                  ` · ${t("reportScore", { score: subject.report_score.toFixed(1) })}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DisciplineSection({
  query,
}: {
  query: ReturnType<typeof useChildDisciplineQuery>;
}): ReactElement {
  const t = useTranslations("app.family.myChildren.discipline");
  const records = query.data?.records ?? [];
  const letters = query.data?.letters ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
      {query.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : records.length === 0 && letters.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-fg-muted">
            {t("totalPoints", { points: query.data?.total_points ?? 0 })}
          </p>
          {letters.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {letters.map((letter, index) => (
                <li
                  key={`${letter.number}-${index}`}
                  className="flex items-center gap-2 text-[13px] text-fg"
                >
                  <FileText className="size-4 text-fg-muted" aria-hidden="true" />
                  {letter.number} · {letter.level_label} · {letter.issued_at}
                </li>
              ))}
            </ul>
          )}
          {records.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {records.map((record, index) => (
                <li
                  key={`${record.type_name}-${record.occurred_on}-${index}`}
                  className="flex items-center justify-between gap-2 text-[13px] text-fg"
                >
                  <span>
                    {record.type_name} <span className="text-fg-muted">{record.occurred_on}</span>
                  </span>
                  <span className="[font-variant-numeric:tabular-nums]">{record.points}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * A guardian's read-only view of their child's bills and payments, the
 * same data the finance office sees on the student's bill history minus
 * anything that would let a parent record or void a payment themselves.
 */
function BillingSection({
  query,
}: {
  query: ReturnType<typeof useChildBillingQuery>;
}): ReactElement {
  const t = useTranslations("app.family.myChildren.billing");
  const locale = useLocale() as Locale;
  const entries = query.data?.data ?? [];
  const outstanding = entries.reduce(
    (sum, entry) => sum + entry.bill.amount_minor - entry.bill.paid_amount_minor,
    0,
  );

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        {entries.length > 0 && (
          <span className="text-[13px] text-fg-muted [font-variant-numeric:tabular-nums]">
            {t("outstanding", { amount: formatCurrency(outstanding, "IDR", { locale }) })}
          </span>
        )}
      </div>
      {query.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<domainIcons.billing aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map(({ bill }) => (
            <li key={bill.id} className="flex items-center justify-between gap-2 text-[13px]">
              <div className="flex flex-col">
                <span className="text-fg">{bill.fee_type_name}</span>
                <span className="text-fg-muted">
                  {bill.period} · {t("dueDate", { date: formatDate(bill.due_date, { locale }) })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-fg [font-variant-numeric:tabular-nums]">
                  {formatCurrency(bill.amount_minor, bill.currency, { locale })}
                </span>
                <Badge variant={bill.status === "paid" ? "accent" : "neutral"}>
                  {t(`status.${bill.status}`)}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
