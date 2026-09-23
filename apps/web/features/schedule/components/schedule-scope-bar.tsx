"use client";

import { Select, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export type ScheduleMode = "class" | "teacher" | "day";

interface Option {
  value: string;
  label: string;
}

/**
 * The view switch and the picker for whichever timetable is shown. It
 * offers only what the reader may open: a student sees their own class
 * named, a teacher without school-wide access gets their own timetable
 * instead of a teacher picker, and the whole-school day view is left out
 * for anyone the server would refuse it to.
 */
export function ScheduleScopeBar({
  mode,
  onModeChange,
  isStudent,
  ownTimetableOnly,
  canViewAll,
  activeDays,
  dayFilter,
  onDayFilterChange,
  classOptions,
  classId,
  className,
  onClassChange,
  teacherOptions,
  teacherId,
  onTeacherChange,
  yearLabel,
}: {
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
  isStudent: boolean;
  ownTimetableOnly: boolean;
  canViewAll: boolean;
  activeDays: readonly number[];
  dayFilter: number;
  onDayFilterChange: (day: number) => void;
  classOptions: Option[];
  classId: string;
  /** Name of the selected class, shown instead of a picker for a student. */
  className: string;
  onClassChange: (id: string) => void;
  teacherOptions: Option[];
  teacherId: string;
  onTeacherChange: (id: string) => void;
  yearLabel: string;
}): ReactElement {
  const t = useTranslations("app.schedule");
  const tDays = useTranslations("app.common.weekdays");

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!isStudent && (
        <Tabs
          value={mode}
          onValueChange={(value) => {
            onModeChange(value as ScheduleMode);
          }}
        >
          <TabsList>
            <TabsTrigger value="class">{t("byClass")}</TabsTrigger>
            <TabsTrigger value="teacher">
              {ownTimetableOnly ? t("mine") : t("byTeacher")}
            </TabsTrigger>
            {canViewAll && <TabsTrigger value="day">{t("byDay")}</TabsTrigger>}
          </TabsList>
        </Tabs>
      )}
      {isStudent ? (
        <span className="text-[14px] font-medium text-fg">{className}</span>
      ) : mode === "day" ? (
        <Select
          options={activeDays.map((day) => ({ value: String(day), label: tDays(String(day)) }))}
          value={String(dayFilter)}
          onValueChange={(value) => {
            onDayFilterChange(Number(value));
          }}
          aria-label={t("pickDay")}
          className="w-40"
        />
      ) : mode === "class" ? (
        <Select
          options={classOptions}
          value={classId}
          onValueChange={onClassChange}
          placeholder={t("pickClass")}
          aria-label={t("pickClass")}
          className="w-56"
        />
      ) : canViewAll ? (
        <Select
          options={teacherOptions}
          value={teacherId}
          onValueChange={onTeacherChange}
          placeholder={t("pickTeacher")}
          aria-label={t("pickTeacher")}
          className="w-64"
        />
      ) : null}
      <span className="text-[13px] text-fg-muted">{yearLabel}</span>
    </div>
  );
}
