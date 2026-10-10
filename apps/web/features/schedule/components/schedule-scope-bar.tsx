"use client";

import { Badge, Select, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";

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
  teacherId: string;
  onTeacherChange: (id: string) => void;
  yearLabel: string;
}): ReactElement {
  const t = useTranslations("app.schedule");
  const tDays = useTranslations("app.common.weekdays");
  const teacherLabels = useDirectoryPickerLabels(t("pickTeacher"));

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
          className="w-40 rounded-full"
        />
      ) : mode === "class" ? (
        <Select
          options={classOptions}
          value={classId}
          onValueChange={onClassChange}
          placeholder={t("pickClass")}
          aria-label={t("pickClass")}
          className="w-56 rounded-full"
        />
      ) : canViewAll ? (
        <DirectoryPicker
          profileKind="teacher"
          value={teacherId}
          onValueChange={onTeacherChange}
          labels={teacherLabels}
          className="w-64 rounded-full"
        />
      ) : null}
      <Badge variant="neutral">{yearLabel}</Badge>
    </div>
  );
}
