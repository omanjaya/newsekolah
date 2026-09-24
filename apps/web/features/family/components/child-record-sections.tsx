"use client";

import { type Locale, formatCurrency, formatDate } from "@newsekolah/i18n";
import { Badge, EmptyState, Input, Skeleton, domainIcons } from "@newsekolah/ui";
import { FileText, GraduationCap, ShieldCheck, Star } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type {
  useChildAttendanceQuery,
  useChildBillingQuery,
  useChildDisciplineQuery,
  useChildGradesQuery,
} from "../api";

export const ATTENDANCE_CODES = ["H", "S", "I", "D", "A"];

export function AttendanceSection({
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

export function GradesSection({
  query,
}: {
  query: ReturnType<typeof useChildGradesQuery>;
}): ReactElement {
  const t = useTranslations("app.family.myChildren.grades");
  const format = useFormatter();
  // Subject names come from the grades response itself: a parent cannot
  // read /v1/academic/subjects (no view_academic_data), so the API names
  // each subject for us instead of the client resolving it from the
  // catalogue.
  const rows = query.data?.subjects ?? [];
  const score = (value: number) =>
    format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const averages = rows.flatMap((row) => {
    const value = row.average ?? row.report_score;
    return value === undefined ? [] : [value];
  });
  const overall =
    averages.length > 0 ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null;

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
          {query.data?.term_name && (
            <p className="text-[13px] text-fg-muted">{query.data.term_name}</p>
          )}
        </div>
        {query.data && (
          <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-fg-muted">
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
        <>
          {overall !== null && (
            <p className="text-[13px] text-fg">
              {t("overall", { score: score(overall), count: rows.length })}
            </p>
          )}
          <ul className="flex flex-col gap-1.5 border-t border-border pt-2">
            {rows.map((subject) => (
              <li
                key={subject.subject_id}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <span className="min-w-0 truncate text-fg">{subject.subject_name}</span>
                <span className="shrink-0 text-fg-muted [font-variant-numeric:tabular-nums]">
                  {subject.average !== undefined && t("average", { score: score(subject.average) })}
                  {subject.report_score !== undefined &&
                    ` · ${t("reportScore", { score: score(subject.report_score) })}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function DisciplineSection({
  query,
}: {
  query: ReturnType<typeof useChildDisciplineQuery>;
}): ReactElement {
  const t = useTranslations("app.family.myChildren.discipline");
  const locale = useLocale() as Locale;
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
                  <FileText className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  {letter.number} · {letter.level_label} ·{" "}
                  {formatDate(letter.issued_at, { locale })}
                </li>
              ))}
            </ul>
          )}
          {records.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {records.map((record, index) => (
                <li
                  key={`${record.type_name}-${record.occurred_on}-${index}`}
                  className="flex items-center justify-between gap-3 py-2 text-[13px] text-fg"
                >
                  <span className="flex flex-col">
                    <span>{record.type_name}</span>
                    <span className="text-[12px] text-fg-muted">
                      {formatDate(record.occurred_on, { locale })}
                    </span>
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
export function BillingSection({
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
