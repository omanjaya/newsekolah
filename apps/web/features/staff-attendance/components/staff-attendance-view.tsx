"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone, useStaffAttendanceRosterQuery } from "../api";

import { EmployeeRecapView } from "./employee-recap-view";
import { StaffAttendanceImportView } from "./import-view";
import { ScheduleEditorView } from "./schedule-editor-view";
import { TodayBoardView } from "./today-board-view";

export function StaffAttendanceView(): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const { me } = useSession();
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["today", "schedule", "recap", "import"],
    "today",
  );
  const [date, setDate] = useDateFilter("date", todayInZone(me?.tenant.timezone));

  const roster = useStaffAttendanceRosterQuery();
  const employees = roster.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="today">{t("tabs.today")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("tabs.schedule")}</TabsTrigger>
          <TabsTrigger value="recap">{t("tabs.recap")}</TabsTrigger>
          <TabsTrigger value="import">{t("tabs.import")}</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="pt-4">
          <TodayBoardView date={date} onDateChange={setDate} employees={employees} />
        </TabsContent>
        <TabsContent value="schedule" className="pt-4">
          <ScheduleEditorView employees={employees} />
        </TabsContent>
        <TabsContent value="recap" className="pt-4">
          <EmployeeRecapView employees={employees} />
        </TabsContent>
        <TabsContent value="import" className="pt-4">
          <StaffAttendanceImportView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
