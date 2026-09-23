"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { EmptyState, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import type { LibraryLoan } from "../api";
import { useMyLibraryProfileQuery } from "../me-api";

import { LibraryTitleName } from "./library-title-name";
import { MyLibraryReservations } from "./my-library-reservations";

function LoanRow({ loan, showDueOn }: { loan: LibraryLoan; showDueOn: boolean }): ReactElement {
  const t = useTranslations("app.library.me");
  const locale = useLocale() as Locale;
  // due_on is a calendar date (YYYY-MM-DD); compare it as one, not as an instant.
  const overdue = showDueOn && loan.due_on < new Date().toLocaleDateString("en-CA");
  const date = formatDate(showDueOn ? loan.due_on : (loan.returned_at ?? loan.borrowed_at), {
    locale,
  });
  return (
    <li className="flex items-center justify-between gap-3 text-[13px]">
      <span className="min-w-0 text-fg">
        <LibraryTitleName titleId={loan.title_id} />
      </span>
      <span className={overdue ? "shrink-0 text-status-absent" : "shrink-0 text-fg-muted"}>
        {showDueOn ? t(overdue ? "overdueSince" : "dueOn", { date }) : date}
      </span>
    </li>
  );
}

/** A member's own loans, history, reservations, and fines, with a self-service reserve form. */
export function MyLibraryView(): ReactElement {
  const t = useTranslations("app.library.me");
  const { data, isLoading, isError, refetch } = useMyLibraryProfileQuery();

  if (isError && !data) return <QueryError retry={() => refetch()} className="m-4" />;

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Skeleton className="h-64 w-full" aria-busy="true" />
      </div>
    );
  }

  if (!data.member) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <EmptyState
          icon={<domainIcons.library aria-hidden="true" />}
          title={t("notMemberTitle")}
          description={t("notMemberBody")}
        />
      </div>
    );
  }

  const unpaidViolations = data.violations.filter((v) => v.status === "unpaid");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {unpaidViolations.length > 0 && (
        <div className="flex flex-col gap-1 rounded-sm border border-status-late/40 bg-surface p-4">
          <h2 className="text-[15px] font-semibold text-fg">{t("unpaidFines")}</h2>
          <ul className="flex flex-col gap-1">
            {unpaidViolations.map((violation) => (
              <li key={violation.id} className="flex justify-between text-[13px]">
                <span className="text-fg">{t(`violationKind.${violation.kind}`)}</span>
                <span className="tabular-nums text-status-late">
                  {t("currency", { amount: violation.amount })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[15px] font-semibold text-fg">{t("activeLoans")}</h2>
          {data.active_loans.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("noActiveLoans")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.active_loans.map((loan) => (
                <LoanRow key={loan.id} loan={loan} showDueOn />
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[15px] font-semibold text-fg">{t("history")}</h2>
          {data.history.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("noHistory")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.history.slice(0, 10).map((loan) => (
                <LoanRow key={loan.id} loan={loan} showDueOn={false} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <MyLibraryReservations
        reservations={data.reservations}
        bookingEnabled={data.booking_enabled ?? false}
      />
    </div>
  );
}
