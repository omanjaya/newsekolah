"use client";

import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  SkeletonCards,
  Stat,
  StatGrid,
  TextLink,
} from "@newsekolah/ui";
import { BookCheck, BookPlus, BookX, DoorOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
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
 * The library's own home: today's circulation as four tiles that each
 * open the place to act (the desk, its overdue queue, the visits), the
 * collection in one quiet strip, the 30-day trend and the most borrowed
 * titles, then the latest loans and the longest overdue. `toolbar` takes
 * the home page's shortcuts when this is a librarian's home.
 */
export function LibraryDashboardView({ toolbar }: { toolbar?: ReactNode } = {}): ReactElement {
  const t = useTranslations("app.library.dashboard");
  const locale = useLocale() as Locale;
  const { data, isLoading, isError, error, refetch } = useLibraryDashboardQuery();

  return (
    <AppPage
      variant="wide"
      title={t("title")}
      nav={false}
      actions={<TextLink href="/library/desk">{t("openDesk")}</TextLink>}
      toolbar={toolbar}
    >
      {isError && !data ? (
        <QueryError retry={refetch} error={error} />
      ) : isLoading || !data ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          <StatGrid variant="tiles" className="lg:grid-cols-4" aria-label={t("today.heading")}>
            <Stat
              icon={<BookPlus />}
              category="blue"
              value={data.summary.loans_today}
              label={t("today.loansToday")}
              href="/library/desk"
              countUp
            />
            <Stat
              icon={<BookCheck />}
              category="green"
              value={data.summary.returns_today}
              label={t("today.returnsToday")}
              href="/library/desk"
              countUp
            />
            <Stat
              icon={<BookX />}
              category="red"
              value={data.summary.overdue}
              label={t("today.overdue")}
              hint={data.summary.overdue > 0 ? t("today.followUp") : undefined}
              href="/library/desk#desk-overdue"
              countUp
            />
            <Stat
              icon={<DoorOpen />}
              category="purple"
              value={data.summary.visits_today}
              label={t("stats.visits_today")}
              href="/library/visits"
              countUp
            />
          </StatGrid>

          <StatGrid variant="strip" aria-label={t("collectionHeading")}>
            {COLLECTION_STAT_KEYS.map((key) => (
              <Stat key={key} label={t(`stats.${key}`)} value={data.summary[key]} />
            ))}
            <Stat
              label={t("stats.unpaid_fines_total")}
              value={formatCurrency(data.summary.unpaid_fines_total, "IDR", { locale })}
            />
          </StatGrid>

          <div className="grid items-start gap-6 lg:grid-cols-3">
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
        </>
      )}
    </AppPage>
  );
}
