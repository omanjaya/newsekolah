"use client";

import { SegmentedControl, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { DayStepper } from "../../attendance/components/day-stepper";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { startOfIsoWeek } from "../week";

export type ScheduleMode = "class" | "teacher" | "day";

interface Option {
  value: string;
  label: string;
}

/** Which week (class and teacher views) or date (day view) is shown. */
export interface ScheduleDates {
  /** The Monday of the week shown. */
  weekOf: string;
  onWeekOfChange: (monday: string) => void;
  /** The date the day view shows. */
  dayDate: string;
  onDayDateChange: (date: string) => void;
  /** The school's today. */
  today: string;
  /** The week as read aloud, "16–22 Nov 2026". */
  weekLabel: string;
  /** The academic year's span, when known: the steppers stay inside it. */
  yearStart?: string;
  yearEnd?: string;
}

const WEEK_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/**
 * The view switch, the picker for whichever timetable is shown and the
 * week (or, in the day view, the date) it is shown for, as the page's
 * toolbar: the same row for every role, so the timetable below does not
 * move between readers. The timetable is effective-dated, so a week is
 * part of what is shown: a lesson changed from a date on looks different
 * before and after it. It offers only what the reader may open: a student
 * has no switch (the toolbar names their class instead), a teacher without
 * school-wide access gets their own timetable instead of a teacher picker,
 * and the whole-school day view is left out for anyone the server would
 * refuse it to.
 */
export function ScheduleScopeBar({
  mode,
  onModeChange,
  isStudent,
  ownTimetableOnly,
  canViewAll,
  dates,
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
  dates: ScheduleDates;
  classOptions: Option[];
  classId: string;
  onClassChange: (id: string) => void;
  teacherId: string;
  onTeacherChange: (id: string) => void;
}): ReactElement {
  const t = useTranslations("app.schedule");
  const teacherLabels = useDirectoryPickerLabels(t("pickTeacher"));

  const stepper =
    mode === "day" ? (
      <DayStepper
        value={dates.dayDate}
        onChange={dates.onDayDateChange}
        today={dates.today}
        min={dates.yearStart}
        max={dates.yearEnd}
        labels={{
          previous: t("previousDay"),
          next: t("nextDay"),
          today: t("today"),
          date: t("pickDate"),
        }}
      />
    ) : (
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <DayStepper
          value={dates.weekOf}
          onChange={dates.onWeekOfChange}
          today={dates.today}
          stepDays={7}
          normalize={startOfIsoWeek}
          formatOptions={WEEK_FORMAT}
          min={dates.yearStart && startOfIsoWeek(dates.yearStart)}
          max={dates.yearEnd}
          labels={{
            previous: t("previousWeek"),
            next: t("nextWeek"),
            today: t("thisWeek"),
            date: t("pickWeek"),
          }}
        />
        <span className="hidden whitespace-nowrap text-body-sm text-fg-muted lg:inline">
          {t("weekLabel", { range: dates.weekLabel })}
        </span>
      </div>
    );

  if (isStudent) return stepper;

  const picker =
    mode === "class" ? (
      <Select
        options={classOptions}
        value={classId}
        onValueChange={onClassChange}
        placeholder={t("pickClass")}
        aria-label={t("pickClass")}
        className="w-full sm:w-56"
      />
    ) : mode === "teacher" && canViewAll ? (
      <DirectoryPicker
        profileKind="teacher"
        value={teacherId}
        onValueChange={onTeacherChange}
        labels={teacherLabels}
        className="w-full sm:w-64"
      />
    ) : null;

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
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
      {stepper}
    </div>
  );
}
