"use client";

import {
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone, useOwnDailyAttendanceReportQuery } from "../api";

import { AttendanceDailySessions } from "./attendance-daily-sessions";
import { DailyReportTab } from "./daily-report-tab";
import { MonthlyReportTab } from "./monthly-report-tab";

/**
 * The dedicated attendance report screen: renders the daily and monthly
 * reports on screen (docs/03-layered-architecture.md), unlike the report
 * centre (features/reports), which only offers a download.
 */
export function AttendanceReportsView(): ReactElement {
  const t = useTranslations("app.attendanceReports");
  const canViewReports = useCan("view_reports");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    canViewReports ? ["mine", "daily", "monthly"] : ["mine"],
    canViewReports ? "daily" : "mine",
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
          {canViewReports && <TabsTrigger value="daily">{t("tabs.daily")}</TabsTrigger>}
          {canViewReports && <TabsTrigger value="monthly">{t("tabs.monthly")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="mine" className="pt-4">
          <MineReportTab />
        </TabsContent>
        {canViewReports && (
          <TabsContent value="daily" className="pt-4">
            <DailyReportTab />
          </TabsContent>
        )}
        {canViewReports && (
          <TabsContent value="monthly" className="pt-4">
            <MonthlyReportTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/**
 * A teacher's own submitted sessions for one day (/reports/daily/mine),
 * scoped to what they taught or substituted -- unlike the "daily" tab,
 * this needs no `view_reports` and no class picker, so it is the report a
 * teacher without that permission can actually open.
 */
function MineReportTab(): ReactElement {
  const t = useTranslations("app.attendanceReports.mine");
  const { me } = useSession();

  const [date, setDate] = useDateFilter("date", todayInZone(me?.tenant.timezone));
  const report = useOwnDailyAttendanceReportQuery(date);
  const sessions = report.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("date")}</span>
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
          aria-label={t("date")}
          className="w-44"
        />
      </label>

      {report.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<FileBarChart aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <AttendanceDailySessions sessions={sessions} />
      )}
    </div>
  );
}
