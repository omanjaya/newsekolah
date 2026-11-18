"use client";

import { SegmentedControl, Select } from "@newsekolah/ui";
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
 * The view switch and the picker for whichever timetable is shown, as the
 * page's toolbar: the same row for every role, so the timetable below does
 * not move between readers. It offers only what the reader may open: a
 * student has no switch (their class is named in the page description), a
 * teacher without school-wide access gets their own timetable instead of a
 * teacher picker, and the whole-school day view is left out for anyone the
 * server would refuse it to.
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
  onClassChange,
  teacherId,
  onTeacherChange,
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
  onClassChange: (id: string) => void;
  teacherId: string;
  onTeacherChange: (id: string) => void;
}): ReactElement | null {
  const t = useTranslations("app.schedule");
  const tDays = useTranslations("app.common.weekdays");
  const teacherLabels = useDirectoryPickerLabels(t("pickTeacher"));
  if (isStudent) return null;

  const picker =
    mode === "day" ? (
      <Select
        options={activeDays.map((day) => ({ value: String(day), label: tDays(String(day)) }))}
        value={String(dayFilter)}
        onValueChange={(value) => {
          onDayFilterChange(Number(value));
        }}
        aria-label={t("pickDay")}
        className="w-full sm:w-44"
      />
    ) : mode === "class" ? (
      <Select
        options={classOptions}
        value={classId}
        onValueChange={onClassChange}
        placeholder={t("pickClass")}
        aria-label={t("pickClass")}
        className="w-full sm:w-56"
      />
    ) : canViewAll ? (
      <DirectoryPicker
        profileKind="teacher"
        value={teacherId}
        onValueChange={onTeacherChange}
        labels={teacherLabels}
        className="w-full sm:w-64"
      />
    ) : null;

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <SegmentedControl<ScheduleMode>
        aria-label={t("viewLabel")}
        value={mode}
        onValueChange={onModeChange}
        options={[
          { value: "class", label: t("byClass") },
          { value: "teacher", label: ownTimetableOnly ? t("mine") : t("byTeacher") },
          ...(canViewAll ? [{ value: "day" as const, label: t("byDay") }] : []),
        ]}
        className="self-start"
      />
      {picker}
    </div>
  );
}
