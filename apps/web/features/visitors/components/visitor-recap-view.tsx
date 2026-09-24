"use client";

import {
  Button,
  Input,
  PageHeader,
  Skeleton,
  Stat,
  StatGrid,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { thisMonthInZone, todayInZone } from "../../../lib/tenant-date";
import {
  type VisitorRecap,
  useDailyRecapQuery,
  useExportDailyRecapMutation,
  useExportMonthlyRecapMutation,
  useMonthlyRecapQuery,
} from "../api";

/** Must match visitors/service/recap.go's recapColumns keys exactly. */
const RECAP_COLUMN_KEYS = ["label", "value"] as const;

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function todayIso(): string {
  return todayInZone();
}

function thisMonthIso(): string {
  return thisMonthInZone();
}

function RecapFigures({ recap }: { recap: VisitorRecap }): ReactElement {
  const t = useTranslations("app.visitors.recap");

  return (
    <div className="flex flex-col gap-4">
      <StatGrid className="rounded-sm border border-border bg-surface p-4 sm:grid-cols-3">
        <Stat label={t("totalVisits")} value={recap.total_visits} />
        <Stat label={t("stillOnCampus")} value={recap.still_on_campus} />
        <Stat label={t("avgStayMinutes")} value={Math.round(recap.avg_stay_minutes)} />
      </StatGrid>
      <div className="rounded-sm border border-border bg-surface p-4">
        <p className="mb-2 text-[13px] font-medium text-fg-muted">{t("incidentsBySeverity")}</p>
        <StatGrid>
          {SEVERITIES.map((sev) => (
            <Stat
              key={sev}
              label={t(`severities.${sev}`)}
              value={recap.incidents_by_severity[sev] ?? 0}
            />
          ))}
        </StatGrid>
      </div>
    </div>
  );
}

function DailyRecapTab(): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const [date, setDate] = useDateFilter("date", todayIso());
  const { data, isLoading, isError, refetch } = useDailyRecapQuery(date);
  const exportDaily = useExportDailyRecapMutation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const columns: ReportExportColumn[] = RECAP_COLUMN_KEYS.map((key) => ({
    key,
    label: t(`columns.${key}`),
  }));

  async function handleExport(options: ReportExportOptions) {
    await exportDaily.mutateAsync({ date, options });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("dateLabel")}</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </label>
        <Button
          variant="secondary"
          icon={<Download />}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          {t("export")}
        </Button>
      </div>
      <ReportExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reportKey="visitors.recap.daily"
        defaultTitle={t("defaultTitleDaily")}
        availableColumns={columns}
        onExport={handleExport}
      />
      {isError && <QueryError retry={() => refetch()} />}
      {isError && !data ? null : isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <RecapFigures recap={data} />
      )}
    </div>
  );
}

function MonthlyRecapTab(): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const [month, setMonth] = useDateFilter("month", thisMonthIso(), true);
  const { data, isLoading, isError, refetch } = useMonthlyRecapQuery(month);
  const exportMonthly = useExportMonthlyRecapMutation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const columns: ReportExportColumn[] = RECAP_COLUMN_KEYS.map((key) => ({
    key,
    label: t(`columns.${key}`),
  }));

  async function handleExport(options: ReportExportOptions) {
    await exportMonthly.mutateAsync({ month, options });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("monthLabel")}</span>
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
            }}
          />
        </label>
        <Button
          variant="secondary"
          icon={<Download />}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          {t("export")}
        </Button>
      </div>
      <ReportExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reportKey="visitors.recap.monthly"
        defaultTitle={t("defaultTitleMonthly")}
        availableColumns={columns}
        onExport={handleExport}
      />
      {isError && <QueryError retry={() => refetch()} />}
      {isError && !data ? null : isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <RecapFigures recap={data} />
      )}
    </div>
  );
}

/** The security office's daily/monthly recap, exportable as a workbook. */
export function VisitorRecapView(): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const [tab, setTab] = useUrlState<string>("tab", ["daily", "monthly"], "daily");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="daily">{t("tabs.daily")}</TabsTrigger>
          <TabsTrigger value="monthly">{t("tabs.monthly")}</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="pt-4">
          <DailyRecapTab />
        </TabsContent>
        <TabsContent value="monthly" className="pt-4">
          <MonthlyRecapTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
