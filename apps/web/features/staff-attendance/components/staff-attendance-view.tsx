"use client";

import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type PageHeaderAction,
} from "@newsekolah/ui";
import { LogIn, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { DayStepper } from "../../attendance/components/day-stepper";
import { todayInZone, useStaffAttendanceRosterQuery } from "../api";

import { EmployeeRecapView } from "./employee-recap-view";
import { StaffAttendanceImportView } from "./import-view";
import { ScheduleEditorView } from "./schedule-editor-view";
import { TodayBoardView } from "./today-board-view";

type StaffTab = "today" | "schedule" | "recap" | "import";

/**
 * Staff attendance for the office and the head: today's board first, then
 * work schedules, the monthly recap and the attendance machine import, as
 * one row of tabs under the title. While the board is open, manual entry
 * is the header's primary action and the day switcher is the toolbar under
 * the tabs, so on a phone it never stacks extra rows above them; an
 * employee's own check-in is a header link, not a button on this board.
 */
export function StaffAttendanceView(): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const { me } = useSession();
  const canImport = useCan("manage_staff_attendance");
  const canManage = canImport;
  const employee = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const tabs: StaffTab[] = canImport
    ? ["today", "schedule", "recap", "import"]
    : ["today", "schedule", "recap"];
  const [tab, setTab] = useUrlState<StaffTab>("tab", tabs, "today");
  const today = todayInZone(me?.tenant.timezone);
  const [date, setDate] = useDateFilter("date", today);
  const [manualOpen, setManualOpen] = useState(false);

  const roster = useStaffAttendanceRosterQuery();
  const employees = roster.data?.data ?? [];
  const onBoard = tab === "today";

  const secondaryActions: PageHeaderAction[] = employee
    ? [{ label: t("self.title"), icon: <LogIn />, href: "/check-in" }]
    : [];

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        setTab(next as StaffTab);
      }}
      className="contents"
    >
      <AppPage
        documentTitle={t(`tabs.${tab}`)}
        toolbar={
          onBoard ? (
            <DayStepper
              value={date}
              onChange={setDate}
              today={today}
              labels={{
                previous: t("today.previousDay"),
                next: t("today.nextDay"),
                today: t("today.backToToday"),
                date: t("today.dateLabel"),
              }}
            />
          ) : undefined
        }
        primaryAction={
          onBoard && canManage ? (
            <Button
              icon={<Plus />}
              onClick={() => {
                setManualOpen(true);
              }}
            >
              {t("today.manualEntry")}
            </Button>
          ) : undefined
        }
        primaryActionCompact={
          onBoard && canManage
            ? {
                icon: <Plus />,
                label: t("today.manualEntry"),
                onSelect: () => {
                  setManualOpen(true);
                },
              }
            : undefined
        }
        secondaryActions={secondaryActions}
        nav={
          <TabsList variant="underline" aria-label={t("tabsLabel")}>
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      >
        <TabsContent value="today" className="flex flex-col gap-6 pt-0">
          <TodayBoardView
            date={date}
            today={today}
            employees={employees}
            manualOpen={manualOpen}
            onManualOpenChange={setManualOpen}
            onOpenSchedule={() => {
              setTab("schedule");
            }}
          />
        </TabsContent>
        <TabsContent value="schedule" className="flex flex-col gap-6 pt-0">
          <ScheduleEditorView employees={employees} />
        </TabsContent>
        <TabsContent value="recap" className="flex flex-col gap-6 pt-0">
          <EmployeeRecapView employees={employees} />
        </TabsContent>
        {canImport && (
          <TabsContent value="import" className="flex flex-col gap-6 pt-0">
            <StaffAttendanceImportView />
          </TabsContent>
        )}
      </AppPage>
    </Tabs>
  );
}
