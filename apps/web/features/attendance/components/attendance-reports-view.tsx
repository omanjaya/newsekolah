"use client";

import {
  Button,
  DatePicker,
  EmptyState,
  Field,
  SkeletonList,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { FileBarChart } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
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
  const { me } = useSession();
  // "Presensi saya" lists the sessions the reader taught, so only a teacher
  // gets it beside the school-wide reports (and a reader with no other
  // report keeps it as the page's one report).
  const isTeacher = me?.roles.some((role) => role.slug === "teacher") ?? false;
  const showMine = isTeacher || !canViewReports;
  const tabs = [...(showMine ? ["mine"] : []), ...(canViewReports ? ["daily", "monthly"] : [])];
  const [tab, setTab] = useUrlState<string>("tab", tabs, canViewReports ? "daily" : "mine");

  return (
    // Every reader reaches this page from the area's tabs, so it keeps the
    // area's title like its sibling pages.
    <AppPage navParams={["date"]}>
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        {/* One report needs no switch. */}
        {tabs.length > 1 && (
          <TabsList aria-label={t("tabsLabel")} className="self-start">
            {tabs.map((id) => (
              <TabsTrigger key={id} value={id}>
                {t(`tabs.${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {showMine && (
          <TabsContent value="mine" className="pt-0">
            <MineReportTab />
          </TabsContent>
        )}
        {canViewReports && (
          <TabsContent value="daily" className="pt-0">
            <DailyReportTab />
          </TabsContent>
        )}
        {canViewReports && (
          <TabsContent value="monthly" className="pt-0">
            <MonthlyReportTab />
          </TabsContent>
        )}
      </Tabs>
    </AppPage>
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
      <Field label={t("date")}>
        <DatePicker value={date} onChange={setDate} clearable={false} className="w-full sm:w-44" />
      </Field>

      {report.isLoading ? (
        <SkeletonList rows={3} />
      ) : report.isError ? (
        <QueryError retry={report.refetch} error={report.error} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<FileBarChart aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/attendance">{t("openToday")}</Link>
            </Button>
          }
        />
      ) : (
        <AttendanceDailySessions sessions={sessions} />
      )}
    </div>
  );
}
