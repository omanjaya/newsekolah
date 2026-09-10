"use client";

import {
  Button,
  Input,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  type VisitorRecap,
  useDailyRecapQuery,
  useExportDailyRecapMutation,
  useExportMonthlyRecapMutation,
  useMonthlyRecapQuery,
} from "../api";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

function RecapFigures({ recap }: { recap: VisitorRecap }): ReactElement {
  const t = useTranslations("app.visitors.recap");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="text-[13px] text-fg-muted">{t("totalVisits")}</p>
          <p className="text-[28px] font-semibold">{recap.total_visits}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="text-[13px] text-fg-muted">{t("stillOnCampus")}</p>
          <p className="text-[28px] font-semibold">{recap.still_on_campus}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="text-[13px] text-fg-muted">{t("avgStayMinutes")}</p>
          <p className="text-[28px] font-semibold">{Math.round(recap.avg_stay_minutes)}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-bg-raised p-4">
        <p className="mb-2 text-[13px] font-medium text-fg-muted">{t("incidentsBySeverity")}</p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SEVERITIES.map((sev) => (
            <div key={sev} className="flex flex-col">
              <dt className="text-[12px] text-fg-muted">{t(`severities.${sev}`)}</dt>
              <dd className="text-[18px] font-semibold">{recap.incidents_by_severity[sev] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function DailyRecapTab(): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const [date, setDate] = useState(todayIso());
  const { data, isLoading } = useDailyRecapQuery(date);
  const exportDaily = useExportDailyRecapMutation();

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
          loading={exportDaily.isPending}
          onClick={() => {
            exportDaily.mutate(date);
          }}
        >
          {t("export")}
        </Button>
      </div>
      {isLoading || !data ? <Skeleton className="h-40 w-full" /> : <RecapFigures recap={data} />}
    </div>
  );
}

function MonthlyRecapTab(): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const [month, setMonth] = useState(thisMonthIso());
  const { data, isLoading } = useMonthlyRecapQuery(month);
  const exportMonthly = useExportMonthlyRecapMutation();

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
          loading={exportMonthly.isPending}
          onClick={() => {
            exportMonthly.mutate(month);
          }}
        >
          {t("export")}
        </Button>
      </div>
      {isLoading || !data ? <Skeleton className="h-40 w-full" /> : <RecapFigures recap={data} />}
    </div>
  );
}

/** The security office's daily/monthly recap, exportable as a workbook. */
export function VisitorRecapView(): ReactElement {
  const t = useTranslations("app.visitors.recap");
  const [tab, setTab] = useState("daily");

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
