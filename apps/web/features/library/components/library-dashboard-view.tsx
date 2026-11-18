"use client";

import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  SectionHeader,
  SkeletonCards,
  Stat,
  StatGrid,
  TextLink,
} from "@newsekolah/ui";
import { BookCheck, BookPlus, BookX, DoorOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactElement, type ReactNode, useId } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useIsDesktop } from "../../../components/use-is-desktop";
import { useCan } from "../../../lib/session/session-provider";
import { useLibraryDashboardQuery } from "../dashboard-api";

import { DashboardActivityLists } from "./dashboard-activity-lists";
import { DashboardSeriesChart } from "./dashboard-series-chart";

const COLLECTION_STAT_KEYS = [
  "titles",
  "copies",
  "available",
  "on_loan",
  "members",
  "active_members",
] as const;

/**
 * The library's own home: today's circulation as four tiles (a compact
 * strip on a phone) that each open the place to act (the desk, its
 * overdue queue, the visits), the collection as a titled section with
 * one quiet strip, the 30-day trend and the most borrowed titles, then
 * the latest loans and the longest overdue. On a phone the collection
 * moves to the end, so today's figures are not stacked on seven more. `toolbar` takes
 * the home page's shortcuts when this is a librarian's home. A reader who
 * oversees the library without running its desk (a headmaster with
 * view_library_reports) sees the same figures as plain tiles: the desk
 * and the visits log are not theirs to open.
 */
export function LibraryDashboardView({ toolbar }: { toolbar?: ReactNode } = {}): ReactElement {
  const t = useTranslations("app.library.dashboard");
  const locale = useLocale() as Locale;
  const { data, isLoading, isError, error, refetch } = useLibraryDashboardQuery();
  const canCirculate = useCan("manage_library_circulation");
  const isDesktop = useIsDesktop();
  const desk = canCirculate ? "/library/desk" : undefined;
  const collectionTitleId = useId();

  // The collection is reference, not today's work: a titled section of
  // its own, so it does not read as a second copy of the today strip. On
  // a phone it closes the page, after the trend and the lists.
  const collection = data && (
    <section aria-labelledby={collectionTitleId} className="flex flex-col gap-3">
      <SectionHeader title={t("collectionHeading")} titleId={collectionTitleId} />
      <StatGrid variant="strip" aria-label={t("collectionHeading")}>
        {COLLECTION_STAT_KEYS.map((key) => (
          <Stat key={key} label={t(`stats.${key}`)} value={data.summary[key]} />
        ))}
        <Stat
          label={t("stats.unpaid_fines_total")}
          value={formatCurrency(data.summary.unpaid_fines_total, "IDR", { locale })}
        />
      </StatGrid>
    </section>
  );

  return (
    <AppPage
      variant="wide"
      title={t("title")}
      nav={false}
      actions={desk ? <TextLink href={desk}>{t("openDesk")}</TextLink> : undefined}
      toolbar={toolbar}
    >
      {isError && !data ? (
        <QueryError retry={refetch} error={error} />
      ) : isLoading || !data ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          {/* Tiles from 768px; on a phone the compact strip, as on the
              school home, so four mostly-zero figures do not fill the
              first screen. Each keeps its link and icon. */}
          <StatGrid
            variant={isDesktop ? "tiles" : "strip"}
            className={isDesktop ? "lg:grid-cols-4" : undefined}
            aria-label={t("today.heading")}
          >
            <Stat
              icon={<BookPlus />}
              category="blue"
              value={data.summary.loans_today}
              label={t("today.loansToday")}
              href={desk}
              countUp
            />
            <Stat
              icon={<BookCheck />}
              category="green"
              value={data.summary.returns_today}
              label={t("today.returnsToday")}
              href={desk}
              countUp
            />
            <Stat
              icon={<BookX />}
              category="red"
              value={data.summary.overdue}
              label={t("today.overdue")}
              hint={data.summary.overdue > 0 ? t("today.followUp") : undefined}
              href={desk && `${desk}#desk-overdue`}
              countUp
            />
            <Stat
              icon={<DoorOpen />}
              category="purple"
              value={data.summary.visits_today}
              label={t("stats.visits_today")}
              href={canCirculate ? "/library/visits" : undefined}
              countUp
            />
          </StatGrid>

          {isDesktop && collection}

          {/* `grid-cols-1` is minmax(0, 1fr): on a phone the one column
              is the screen's width, so a long list title truncates
              inside its card instead of widening the track. Cards in one
              desktop row stretch to the same height. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle as="h2">{t("seriesTitle")}</CardTitle>
              </CardHeader>
              <div className="px-5 pb-5">
                <DashboardSeriesChart series={data.series} />
              </div>
            </Card>
            <DashboardActivityLists
              latestLoans={data.latest_loans}
              longestOverdue={data.longest_overdue}
              popularTitles={data.popular_titles}
            />
          </div>

          {!isDesktop && collection}
        </>
      )}
    </AppPage>
  );
}
