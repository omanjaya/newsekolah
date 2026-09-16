"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { EmptyState, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LibraryLoan, LibraryMostBorrowedTitle } from "../api";

import { LibraryTitleName } from "./library-title-name";

function LoanList({
  loans,
  emptyLabel,
  showDueOn,
}: {
  loans: LibraryLoan[];
  emptyLabel: string;
  showDueOn: boolean;
}): ReactElement {
  const t = useTranslations("app.library.dashboard");
  const locale = useLocale() as Locale;

  if (loans.length === 0) {
    return (
      <p className="text-[13px] text-fg-muted">
        {emptyLabel}{" "}
        <Link href="/library/desk" className="text-accent underline underline-offset-2">
          {t("openDesk")}
        </Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {loans.map((loan) => (
        <li key={loan.id} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="truncate text-fg">
            <LibraryTitleName titleId={loan.title_id} />
          </span>
          <span className="shrink-0 text-fg-muted">
            {formatDate(showDueOn ? loan.due_on : loan.borrowed_at, { locale })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The dashboard's three read-only lists: latest loans, longest overdue, and popular titles. */
export function DashboardActivityLists({
  latestLoans,
  longestOverdue,
  popularTitles,
}: {
  latestLoans: LibraryLoan[];
  longestOverdue: LibraryLoan[];
  popularTitles: LibraryMostBorrowedTitle[];
}): ReactElement {
  const t = useTranslations("app.library.dashboard");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[15px] font-semibold text-fg">{t("latestLoans")}</h2>
        <LoanList loans={latestLoans} emptyLabel={t("noLatestLoans")} showDueOn={false} />
      </div>

      <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[15px] font-semibold text-fg">{t("longestOverdue")}</h2>
        <LoanList loans={longestOverdue} emptyLabel={t("noOverdue")} showDueOn />
      </div>

      <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[15px] font-semibold text-fg">{t("popularTitles")}</h2>
        {popularTitles.length === 0 ? (
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={t("noPopularTitles")}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {popularTitles.map((entry) => (
              <li
                key={entry.title.id}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span className="truncate text-fg">{entry.title.title}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  {t("loanCount", { count: entry.loan_count })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
