"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { EmptyState, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useSession } from "../../../lib/session/session-provider";
import { useMyDisciplineQuery } from "../api";

/**
 * A student's own discipline record: total points, warning letters, and
 * the violation records behind them. Plain and factual, no verdict beyond
 * what the ledger itself carries (DESIGN.md on copy tone).
 */
export function MyDisciplineView(): ReactElement {
  const t = useTranslations("app.discipline.myDiscipline");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const { data, isLoading, error, refetch } = useMyDisciplineQuery();
  const records = (data?.records ?? []).filter((r) => !r.is_voided);
  const letters = data?.letters ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return <QueryError retry={() => refetch()} className="m-4 md:m-6" />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {records.length === 0 && letters.length === 0 ? (
        <EmptyState
          icon={<domainIcons.violation aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] font-medium text-fg [font-variant-numeric:tabular-nums]">
            {t("totalPoints", { points: data.total_points })}
          </p>

          {letters.length > 0 && (
            <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
              <h2 className="text-[16px] font-medium text-fg">{t("letters")}</h2>
              <ul className="flex flex-col gap-1.5">
                {letters.map((letter) => (
                  <li key={letter.id} className="flex items-start gap-2 text-[13px] text-fg">
                    <FileText className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                    <span>
                      {letter.letter_number} · {letter.level_label} ·{" "}
                      <span className="text-fg-muted">
                        {formatDate(letter.issued_at, { locale, timeZone })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
            <h2 className="text-[16px] font-medium text-fg">{t("records")}</h2>
            {records.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("recordsEmpty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {records.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center justify-between gap-3 py-2 text-[13px] text-fg"
                  >
                    <span className="flex flex-col">
                      <span>{record.type_name}</span>
                      <span className="text-[12px] text-fg-muted">
                        {formatDate(record.occurred_on, { locale, timeZone })}
                      </span>
                    </span>
                    <span className="[font-variant-numeric:tabular-nums]">{record.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
