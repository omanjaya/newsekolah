"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Alert, Badge, Button, Card, Dialog, DialogContent, Skeleton, cn } from "@newsekolah/ui";
import { CheckCircle2, Circle, NotebookPen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { bentoCells } from "../../../lib/layout/bento";
import { useSession } from "../../../lib/session/session-provider";
import { useSimulation } from "../../../lib/simulation/clock";
import { todayInZone } from "../../../lib/tenant-date";
import {
  useClassesQuery,
  useLookup,
  useSchoolDaysQuery,
  useSubjectsQuery,
  type ClassRef,
  type SubjectRef,
} from "../../reference/api";
import { useSchedulesQuery } from "../../schedule/api";
import { useJournalsQuery, type Journal } from "../api";
import {
  buildLessonDays,
  journalEntryKey,
  shiftDateISO,
  type LessonDayGroup,
} from "../lib/build-lesson-days";

import { JournalForm } from "./journal-form";

interface PrefillTarget {
  classId: string;
  subjectId: string;
  date: string;
}

/**
 * The teacher's own weekly timetable expanded into lesson rows for the
 * last week of school days, each flagged filled/unfilled against the
 * journals already saved -- shared by {@link JournalTodayPanel} (the
 * rendering) and the `/journal` stat tiles (`computeJournalWeekStats`),
 * so both read the exact same window instead of two slightly different
 * ideas of "this week".
 */
export function useJournalTodayData(): {
  loading: boolean;
  isError: boolean;
  refetch: () => void;
  today: string;
  yesterday: string;
  groups: LessonDayGroup[];
  classMap: Map<string, ClassRef>;
  subjectMap: Map<string, SubjectRef>;
  /** The already-saved entry for a filled lesson, keyed by `journalEntryKey`. */
  journalByKey: Map<string, Journal>;
} {
  useSimulation();
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

  return {
    loading: schedules.isLoading || schoolDays.isLoading || journals.isLoading,
    isError: schedules.isError,
    refetch: () => {
      void schedules.refetch();
    },
    today,
    yesterday,
    groups,
    classMap,
    subjectMap,
    journalByKey,
  };
}

/**
 * "What did I teach recently, and did I write it up" (docs/07-ui-ux.md's
 * Hijau Segar bento language). Today's lessons needing attention render as
 * the same bento card grid as the attendance day list
 * (`AttendanceSessionCard`): one card per lesson, a primary "Tulis jurnal"
 * for an unfilled one, a quieter "Lihat jurnal" once it is saved. Earlier
 * days in the window stay a compact history list below -- context, not
 * something still to act on. Renders nothing (not even a skeleton) once
 * the schedule/journal data resolves to no recent lesson at all, rather
 * than an empty panel above an already-adequate history table.
 */
export function JournalTodayPanel(): ReactElement | null {
  const t = useTranslations("app.journal.recent");
  const tApp = useTranslations("app");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const data = useJournalTodayData();

  const [target, setTarget] = useState<PrefillTarget | Journal | null>(null);

  if (!data.loading && data.isError) {
    return (
      <Alert variant="warning" title={t("loadError")}>
        <Button size="sm" variant="secondary" onClick={data.refetch}>
          {tApp("offlinePage.retry")}
        </Button>
      </Alert>
    );
  }

  if (data.loading) {
    return <Skeleton className="h-24 w-full" aria-busy="true" />;
  }

  if (data.groups.length === 0) return null;

  const todayGroup = data.groups.find((group) => group.date === data.today);
  const historyGroups = data.groups.filter((group) => group.date !== data.today);

  function dayLabel(date: string): string {
    if (date === data.yesterday) return t("yesterdayLabel");
    return formatDate(new Date(`${date}T00:00:00`), { locale, timeZone: me?.tenant.timezone });
  }

  function open(classId: string, subjectId: string, date: string) {
    const existing = data.journalByKey.get(journalEntryKey(classId, subjectId, date));
    setTarget(existing ?? { classId, subjectId, date });
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-[14px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("subtitle")}</p>
      </div>

      {todayGroup && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-fg-muted">{t("todayLabel")}</p>
          <TodayLessonCards
            group={todayGroup}
            classMap={data.classMap}
            subjectMap={data.subjectMap}
            onOpen={open}
          />
        </div>
      )}

      {historyGroups.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          {historyGroups.map((group) => (
            <div key={group.date} className="flex flex-col gap-1.5">
              <p className="text-[12px] font-medium text-fg-muted">{dayLabel(group.date)}</p>
              <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
                {group.lessons.map((lesson) => {
                  const className = data.classMap.get(lesson.classId)?.name ?? "";
                  const subjectName = data.subjectMap.get(lesson.subjectId)?.name ?? "";
                  const key = journalEntryKey(lesson.classId, lesson.subjectId, group.date);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-bg"
                        onClick={() => {
                          open(lesson.classId, lesson.subjectId, group.date);
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
                            <span className="truncate text-[12px] text-fg-muted">
                              {subjectName}
                            </span>
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
      )}

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

/**
 * Today's lessons as the shared bento grid (`bentoCells`, docs/07-ui-ux.md):
 * one card per lesson, equal heights, the odd one out spanning the full
 * row -- same layout rule as the attendance day list.
 */
function TodayLessonCards({
  group,
  classMap,
  subjectMap,
  onOpen,
}: {
  group: LessonDayGroup;
  classMap: Map<string, ClassRef>;
  subjectMap: Map<string, SubjectRef>;
  onOpen: (classId: string, subjectId: string, date: string) => void;
}): ReactElement {
  const cells = bentoCells(
    group.lessons.map((lesson) => ({
      key: journalEntryKey(lesson.classId, lesson.subjectId, group.date),
      node: (
        <TodayLessonCard
          lesson={lesson}
          className={classMap.get(lesson.classId)?.name ?? ""}
          subjectName={subjectMap.get(lesson.subjectId)?.name ?? ""}
          onOpen={() => {
            onOpen(lesson.classId, lesson.subjectId, group.date);
          }}
        />
      ),
    })),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="journal-today-cards">
      {cells.map((cell) => (
        <div
          key={cell.key}
          data-testid={`journal-today-cell-${cell.key}`}
          className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
        >
          <div className="flex-1">{cell.node}</div>
        </div>
      ))}
    </div>
  );
}

function TodayLessonCard({
  lesson,
  className,
  subjectName,
  onOpen,
}: {
  lesson: LessonDayGroup["lessons"][number];
  className: string;
  subjectName: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.journal.recent");
  return (
    <Card
      className="flex h-full flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
      data-testid={`journal-today-card-${lesson.scheduleId}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-category-green-soft text-category-green-soft-fg">
          <NotebookPen className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-[15px] font-medium text-fg">
            {subjectName} <span className="text-fg-muted">&middot;</span> {className}
          </p>
          <Badge
            variant={lesson.filled ? "accent" : "neutral"}
            className={cn(lesson.filled ? "" : "text-fg-muted", "w-fit")}
          >
            {lesson.filled ? t("filled") : t("unfilled")}
          </Badge>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end md:self-auto">
        {lesson.filled ? (
          <Button size="sm" variant="secondary" onClick={onOpen}>
            {t("editAction")}
          </Button>
        ) : (
          <Button size="sm" onClick={onOpen}>
            {t("writePrimary")}
          </Button>
        )}
      </div>
    </Card>
  );
}
