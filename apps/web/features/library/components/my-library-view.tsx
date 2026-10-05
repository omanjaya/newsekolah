"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { EmptyState, PageHeader, Skeleton, StatTile, cn, domainIcons } from "@newsekolah/ui";
import { Bookmark, BookOpen, CalendarClock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { businessNow } from "../../../lib/simulation/clock";
import { useMyLibraryProfileQuery } from "../me-api";

import { MyLibraryHistoryTable } from "./my-library-history-table";
import { MyLibraryLoanRow } from "./my-library-loan-row";
import { MyLibraryReservations } from "./my-library-reservations";
import { countMyLibraryTiles } from "./my-library-tiles";

function todayIso(): string {
  return businessNow().toLocaleDateString("en-CA");
}

/**
 * A student's own library screen, in the Hijau Segar bento language
 * (docs/07-ui-ux.md section 0): stat tiles for what is borrowed, the
 * soonest due date, how many are overdue, and pending reservations;
 * active loans as bento cards; history as the shared table; and the
 * self-service reservation list/form unchanged below.
 */
export function MyLibraryView(): ReactElement {
  const t = useTranslations("app.library.me");
  const locale = useLocale() as Locale;
  const today = todayIso();
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

  // A violation can be marked "unpaid" with a Rp0 amount (e.g. a waived
  // fine); only a positive amount is actually owed and worth surfacing.
  const unpaidViolations = data.violations.filter((v) => v.status === "unpaid" && v.amount > 0);

  const counts = countMyLibraryTiles(data.active_loans, data.reservations, today);
  const tiles = [
    {
      key: "activeLoans",
      icon: BookOpen,
      tone: "blue" as const,
      value: String(counts.activeLoans),
      label: t("activeLoans"),
    },
    {
      key: "nextDue",
      icon: CalendarClock,
      tone: "amber" as const,
      value: counts.nextDueOn ? formatDate(counts.nextDueOn, { locale }) : "-",
      label: t("tiles.nextDue"),
    },
    {
      key: "overdue",
      icon: domainIcons.late,
      tone: "red" as const,
      value: String(counts.overdue),
      label: t("tiles.overdue"),
    },
    {
      key: "reservations",
      icon: Bookmark,
      tone: "purple" as const,
      value: String(counts.reservations),
      label: t("reserve.heading"),
    },
  ];
  const tileGrid = tileColumns(tiles.length);

  const loanCells = bentoCells(
    data.active_loans.map((loan) => ({
      key: loan.id,
      node: <MyLibraryLoanRow loan={loan} today={today} locale={locale} className="h-full" />,
    })),
  );

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

      <div className={tileGrid.container} data-testid="my-library-tiles">
        {tiles.map((tile, index) => (
          <div
            key={tile.key}
            data-testid={`my-library-tile-${tile.key}`}
            className={cn("h-full", index === tiles.length - 1 && tileGrid.lastTileClassName)}
          >
            <StatTile
              className="h-full"
              icon={tile.icon}
              tone={tile.tone}
              value={tile.value}
              label={tile.label}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-fg">{t("activeLoans")}</h2>
        {data.active_loans.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("noActiveLoans")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2" data-testid="my-library-loan-cards">
            {loanCells.map((cell) => (
              <div
                key={cell.key}
                data-testid={`my-library-loan-cell-${cell.key}`}
                className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
              >
                <div className="flex-1">{cell.node}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MyLibraryHistoryTable history={data.history} locale={locale} />

      <MyLibraryReservations
        reservations={data.reservations}
        bookingEnabled={data.booking_enabled ?? false}
      />
    </div>
  );
}
