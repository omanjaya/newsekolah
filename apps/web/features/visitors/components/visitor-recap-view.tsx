"use client";

import { formatDate, type Locale } from "@newsekolah/i18n";
import {
  EmptyState,
  MonthPicker,
  SectionHeader,
  SegmentedControl,
  SkeletonCards,
  Stat,
  StatGrid,
  type StatCategory,
} from "@newsekolah/ui";
import { DoorOpen, Download, ShieldAlert, Timer, UsersRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useSession } from "../../../lib/session/session-provider";
import { thisMonthInZone, todayInZone } from "../../../lib/tenant-date";
import { DayStepper } from "../../attendance/components/day-stepper";
import { VisitorsWorkspaceNav } from "../../student-services/components/service-workspace-nav";
import {
  type VisitorRecap,
  useDailyRecapQuery,
  useExportDailyRecapMutation,
  useExportMonthlyRecapMutation,
  useMonthlyRecapQuery,
} from "../api";
import { SEVERITIES } from "../lib/incident-severity";

import { useStayLabel } from "./on-site-list";

/** Must match visitors/service/recap.go's recapColumns keys exactly. */
const RECAP_COLUMN_KEYS = ["label", "value"] as const;

const PERIODS = ["daily", "monthly"] as const;
type Period = (typeof PERIODS)[number];

/** Category hues that read as rising severity, since a stat tile takes a topic hue. */
const SEVERITY_TONE: Record<(typeof SEVERITIES)[number], StatCategory> = {
  low: "green",
  medium: "blue",
  high: "amber",
  critical: "red",
};

function RecapFigures({ recap, period }: { recap: VisitorRecap; period: string }): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const stayLabel = useStayLabel();
  const incidents = SEVERITIES.reduce(
    (sum, severity) => sum + (recap.incidents_by_severity[severity] ?? 0),
    0,
  );

  if (recap.total_visits === 0 && incidents === 0) {
    return (
      <EmptyState
        icon={<UsersRound />}
        title={t("emptyTitle", { period })}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHeader title={t("visitsTitle")} />
        <StatGrid variant="tiles" className="grid-cols-1 sm:grid-cols-3">
          <Stat
            icon={<UsersRound />}
            tone="green"
            label={t("totalVisits")}
            value={recap.total_visits}
          />
          <Stat
            icon={<DoorOpen />}
            tone="amber"
            label={t("stillOnCampus")}
            value={recap.still_on_campus}
          />
          <Stat
            icon={<Timer />}
            tone="blue"
            label={t("avgStay")}
            value={recap.total_visits > 0 ? stayLabel(Math.round(recap.avg_stay_minutes)) : "–"}
          />
        </StatGrid>
      </section>
      <section className="flex flex-col gap-3">
        <SectionHeader title={t("incidentsBySeverity")} count={incidents} />
        <StatGrid variant="tiles" className="grid-cols-2 sm:grid-cols-4">
          {SEVERITIES.map((severity) => (
            <Stat
              key={severity}
              icon={<ShieldAlert />}
              tone={SEVERITY_TONE[severity]}
              label={t(`severities.${severity}`)}
              value={recap.incidents_by_severity[severity] ?? 0}
            />
          ))}
        </StatGrid>
      </section>
    </div>
  );
}

/** The figures of one period, its loading and failure states included. */
function RecapBody({
  query,
  period,
}: {
  query: { data?: VisitorRecap; isLoading: boolean; error: unknown; refetch: () => unknown };
  period: string;
}): ReactNode {
  if (query.data) return <RecapFigures recap={query.data} period={period} />;
  if (query.error) return <QueryError retry={query.refetch} error={query.error} />;
  return <SkeletonCards count={3} className="grid-cols-1 sm:grid-cols-3" />;
}

/**
 * The security office's recap of one day or one month: visits, who is
 * still on site, the average stay, and incidents by severity, exportable as
 * a workbook or PDF. On its own route the page shows the visitor book's
 * tabs. Inside the reports hub (`tabKey` other than "tab", which names the
 * period's URL parameter) it is one section of that page: `sectionNav`, the
 * hub's strip of report sections, replaces the visitor tabs and the page
 * keeps the hub's title, so switching sections never swaps the header; a
 * reader with the recap as the hub's only section gets the recap's own
 * title and no tabs.
 */
export function VisitorRecapView({
  tabKey = "tab",
  sectionNav,
}: { tabKey?: string; sectionNav?: ReactNode } = {}): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const today = todayInZone(timeZone);
  const [period, setPeriod] = useUrlState<Period>(tabKey, PERIODS, "daily");
  const [date, setDate] = useDateFilter("date", today);
  const [month, setMonth] = useDateFilter("month", thisMonthInZone(timeZone), true);
  const daily = useDailyRecapQuery(period === "daily" ? date : "");
  const monthly = useMonthlyRecapQuery(period === "monthly" ? month : "");
  const exportDaily = useExportDailyRecapMutation();
  const exportMonthly = useExportMonthlyRecapMutation();
  const [exporting, setExporting] = useState(false);

  const columns: ReportExportColumn[] = RECAP_COLUMN_KEYS.map((key) => ({
    key,
    label: t(`columns.${key}`),
  }));
  const periodLabel =
    period === "daily"
      ? formatDate(`${date}T12:00:00Z`, { locale, timeZone: "UTC" })
      : new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${month}-01T12:00:00Z`));

  const embedded = tabKey !== "tab";

  async function handleExport(options: ReportExportOptions) {
    if (period === "daily") await exportDaily.mutateAsync({ date, options });
    else await exportMonthly.mutateAsync({ month, options });
  }

  return (
    <AppPage
      title={embedded && !sectionNav ? t("documentTitle") : undefined}
      nav={sectionNav ?? (embedded ? false : <VisitorsWorkspaceNav />)}
      documentTitle={t("documentTitle")}
      // The period acts on the recap, so it is the toolbar, under the tabs:
      // the tab row then sits at the same height on every Buku tamu page.
      toolbar={
        <>
          <SegmentedControl<Period>
            aria-label={t("periodLabel")}
            value={period}
            onValueChange={setPeriod}
            options={[
              { value: "daily", label: t("tabs.daily") },
              { value: "monthly", label: t("tabs.monthly") },
            ]}
          />
          {period === "daily" ? (
            <DayStepper
              value={date}
              onChange={setDate}
              today={today}
              labels={{
                previous: t("day.previous"),
                next: t("day.next"),
                today: t("day.today"),
                date: t("dateLabel"),
              }}
            />
          ) : (
            <MonthPicker
              value={month}
              onChange={(next) => {
                if (next) setMonth(next);
              }}
              today={today}
              clearable={false}
              aria-label={t("monthLabel")}
              className="w-44"
            />
          )}
        </>
      }
      secondaryActions={[
        {
          label: t("export"),
          icon: <Download />,
          onSelect: () => {
            setExporting(true);
          },
        },
      ]}
    >
      <RecapBody query={period === "daily" ? daily : monthly} period={periodLabel} />
      <ReportExportDialog
        open={exporting}
        onOpenChange={setExporting}
        reportKey={period === "daily" ? "visitors.recap.daily" : "visitors.recap.monthly"}
        defaultTitle={period === "daily" ? t("defaultTitleDaily") : t("defaultTitleMonthly")}
        availableColumns={columns}
        onExport={handleExport}
      />
    </AppPage>
  );
}
