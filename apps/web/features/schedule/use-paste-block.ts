"use client";

import { useToast } from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";

import { formatCalendarDate } from "../../lib/format-calendar-date";

import { type ScheduleBlock, useCreateScheduleMutation } from "./api";
import type { EditorDates } from "./components/schedule-dialogs";
import { cellDate, defaultEffectiveFrom } from "./week";

interface Period {
  id: string;
  sequence: number;
  is_break: boolean;
}

/**
 * Drops the copied lesson into an empty slot, keeping its class, subject,
 * teacher and length, and moving only where it sits. The server refuses a
 * clash, so a paste onto a busy teacher comes back as its own error
 * (`describeError`) rather than being guessed at here. The pasted lesson
 * starts on the slot's date in the week shown (never before today): it
 * was not there in the weeks before.
 */
export function usePasteBlock({
  copied,
  lessonPeriods,
  yearId,
  dates,
  describeError,
}: {
  copied: ScheduleBlock | null;
  lessonPeriods: Period[];
  yearId: string;
  dates: EditorDates;
  describeError: (err: unknown) => Promise<string>;
}): { pasteInto: (day: number, startSeq: number, intoClassId?: string) => Promise<void> } {
  const t = useTranslations("app.schedule");
  const format = useFormatter();
  const toast = useToast();
  const create = useCreateScheduleMutation();

  async function pasteInto(day: number, startSeq: number, intoClassId?: string) {
    if (!copied) return;
    const span = copied.end_seq - copied.start_seq;
    const start = lessonPeriods.find((p) => p.sequence === startSeq);
    // A lesson does not run through a break, so a paste that would reach
    // past one is refused rather than quietly drawn over it.
    const crossesBreak = lessonPeriods.some(
      (p) => p.is_break && p.sequence > startSeq && p.sequence <= startSeq + span,
    );
    const end = lessonPeriods.find((p) => p.sequence === startSeq + span);
    if (!start || !end || crossesBreak) {
      toast.error(t("pasteNoRoom"));
      return;
    }
    try {
      const pasted = await create.mutateAsync({
        academic_year_id: yearId,
        class_id: intoClassId ?? copied.class_id,
        subject_id: copied.subject_id,
        teacher_user_id: copied.teacher_user_id,
        day_of_week: day,
        start_period_id: start.id,
        end_period_id: end.id,
        source: "admin",
        effective_from: defaultEffectiveFrom({
          today: dates.today,
          preferred: cellDate(dates.weekStart, day),
          yearStart: dates.yearStart,
          yearEnd: dates.yearEnd,
        }),
      });
      toast.success(
        t("pastedFrom", {
          date: formatCalendarDate(format, pasted.effective_from, {
            weekday: "long",
            day: "numeric",
            month: "long",
          }),
        }),
      );
    } catch (err) {
      toast.error(await describeError(err));
    }
  }

  return { pasteInto };
}
