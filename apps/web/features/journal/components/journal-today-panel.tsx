"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Alert, Badge, Button, Dialog, DialogContent, Skeleton, cn } from "@newsekolah/ui";
import { CheckCircle2, Circle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import {
  useClassesQuery,
  useLookup,
  useSchoolDaysQuery,
  useSubjectsQuery,
} from "../../reference/api";
import { useSchedulesQuery } from "../../schedule/api";
import { useJournalsQuery, type Journal } from "../api";
import { buildLessonDays, journalEntryKey, shiftDateISO } from "../lib/build-lesson-days";

import { JournalForm } from "./journal-form";

interface PrefillTarget {
  classId: string;
  subjectId: string;
  date: string;
}

/**
 * "What did I teach recently, and did I write it up" -- one row per lesson
 * from the teacher's own weekly timetable, for the last week of school
 * days, each with a filled/unfilled indicator and a one-tap "isi jurnal"
 * that opens the same {@link JournalForm} the page's own "+" button and
 * the attendance session's Jurnal tab use. Renders nothing (not even a
 * skeleton) once the schedule/journal data resolves to no recent lesson,
 * rather than an empty panel above an already-adequate history table.
 */
export function JournalTodayPanel(): ReactElement | null {
  const t = useTranslations("app.journal.recent");
  const tApp = useTranslations("app");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const year = useActiveYear();

  const schedules = useSchedulesQuery({ academicYearId: year.id, teacherUserId: me?.id });
  const schoolDays = useSchoolDaysQuery();
  // Page 0 alone is enough: the server already orders by lesson_date desc,
  // and 30 rows comfortably covers a week even for a teacher with several
  // lessons a day.
  const journals = useJournalsQuery(undefined, 0, 30);
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);

  const [target, setTarget] = useState<PrefillTarget | Journal | null>(null);

  const today = todayInZone(me?.tenant.timezone);
  const yesterday = shiftDateISO(today, -1);

  const activeWeekdays = useMemo(() => {
    const active = new Set(
      (schoolDays.data?.data ?? []).filter((d) => d.is_active).map((d) => d.day_of_week),
    );
    return active.size > 0 ? active : new Set([1, 2, 3, 4, 5]);
  }, [schoolDays.data]);

  const journalByKey = useMemo(() => {
    const map = new Map<string, Journal>();
    for (const entry of journals.data?.data ?? []) {
      map.set(journalEntryKey(entry.class_id, entry.subject_id, entry.lesson_date), entry);
    }
    return map;
  }, [journals.data]);

  const blocks = useMemo(
    () =>
      (schedules.data?.data ?? []).map((block) => ({
        scheduleId: block.schedule_ids[0] ?? block.class_id,
        classId: block.class_id,
        subjectId: block.subject_id,
        dayOfWeek: block.day_of_week,
      })),
    [schedules.data],
  );

  const groups = useMemo(
    () => buildLessonDays(today, 7, activeWeekdays, blocks, new Set(journalByKey.keys())),
    [today, activeWeekdays, blocks, journalByKey],
  );

  const loading = schedules.isLoading || schoolDays.isLoading || journals.isLoading;

  if (!loading && schedules.isError) {
    return (
      <Alert variant="warning" title={t("loadError")}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void schedules.refetch();
          }}
        >
          {tApp("offlinePage.retry")}
        </Button>
      </Alert>
    );
  }

  if (loading) {
    return <Skeleton className="h-24 w-full" aria-busy="true" />;
  }

  if (groups.length === 0) return null;

  function dayLabel(date: string): string {
    if (date === today) return t("todayLabel");
    if (date === yesterday) return t("yesterdayLabel");
    return formatDate(new Date(`${date}T00:00:00`), { locale, timeZone: me?.tenant.timezone });
  }

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div>
        <h2 className="text-[14px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("subtitle")}</p>
      </div>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.date} className="flex flex-col gap-1.5">
            <p className="text-[12px] font-medium text-fg-muted">{dayLabel(group.date)}</p>
            <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
              {group.lessons.map((lesson) => {
                const className = classMap.get(lesson.classId)?.name ?? "";
                const subjectName = subjectMap.get(lesson.subjectId)?.name ?? "";
                const key = journalEntryKey(lesson.classId, lesson.subjectId, group.date);
                const existing = journalByKey.get(key);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-bg"
                      onClick={() => {
                        setTarget(
                          existing ?? {
                            classId: lesson.classId,
                            subjectId: lesson.subjectId,
                            date: group.date,
                          },
                        );
                      }}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {lesson.filled ? (
                          <CheckCircle2
                            className="size-4 shrink-0 text-status-present"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                        )}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-medium text-fg">
                            {className}
                          </span>
                          <span className="truncate text-[12px] text-fg-muted">{subjectName}</span>
                        </span>
                      </span>
                      <Badge
                        variant={lesson.filled ? "accent" : "neutral"}
                        className={cn("shrink-0", !lesson.filled && "text-fg-muted")}
                      >
                        {lesson.filled ? t("filled") : t("unfilled")}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent title={target && "id" in target ? t("editAction") : t("fillAction")}>
          {target !== null &&
            ("id" in target ? (
              <JournalForm
                initial={target}
                onDone={() => {
                  setTarget(null);
                }}
              />
            ) : (
              <JournalForm
                prefillClassId={target.classId}
                prefillSubjectId={target.subjectId}
                prefillDate={target.date}
                onDone={() => {
                  setTarget(null);
                }}
              />
            ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}
