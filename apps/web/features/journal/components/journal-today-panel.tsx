"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CountBadge,
  Dialog,
  DialogContent,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  cn,
} from "@newsekolah/ui";
import { CheckCircle2, PenLine } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useCan, useSession } from "../../../lib/session/session-provider";
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

  // Roles without schedule access (e.g. security staff) can still open the
  // journal history; they have no lessons to catch up on, so skip the request
  // instead of turning its 403 into a "failed to load" alert.
  const canViewSchedules = useCan("view_schedules");
  const schedules = useSchedulesQuery({
    academicYearId: year.id,
    teacherUserId: me?.id,
    enabled: canViewSchedules,
  });
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
    isError:
      schedules.isError && !(schedules.error instanceof ApiError && schedules.error.status === 403),
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
 * "Perlu diisi": the lessons of the last week of school days that still
 * have no journal, newest first, each with one "Tulis" action that opens
 * the form already filled with its class, subject and date. Written
 * lessons are not repeated here; they are the history table beside it.
 * The one home of the journal backlog (the attendance screens only show a
 * session's own journal state). Renders nothing for a reader without a
 * timetable, and a calm "all written" line once nothing is missing.
 */
export function JournalTodayPanel({ className }: { className?: string }): ReactElement | null {
  const t = useTranslations("app.journal.recent");
  const tApp = useTranslations("app");
  const format = useFormatter();
  const { me } = useSession();
  const data = useJournalTodayData();

  const [target, setTarget] = useState<PrefillTarget | null>(null);

  if (!data.loading && data.isError) {
    return (
      <Alert
        variant="danger"
        title={t("loadError")}
        className={className}
        action={
          <Button size="sm" variant="secondary" onClick={data.refetch}>
            {tApp("offlinePage.retry")}
          </Button>
        }
      />
    );
  }

  if (data.loading) {
    return (
      <Card className={className}>
        <SkeletonList rows={3} leading={false} />
      </Card>
    );
  }

  if (data.groups.length === 0) return null;

  // Newest first, so today's and yesterday's lessons lead the list.
  const missing = [...data.groups]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((group) =>
      group.lessons
        .filter((lesson) => !lesson.filled)
        .map((lesson) => ({ ...lesson, date: group.date })),
    );

  function dayLabel(date: string): string {
    if (date === data.today) return t("todayLabel");
    if (date === data.yesterday) return t("yesterdayLabel");
    return format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: me?.tenant.timezone,
    });
  }

  return (
    <Card className={cn("flex min-h-0 flex-col", className)} data-testid="journal-backlog">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {t("title")}
          <CountBadge count={missing.length} tone="accent" />
        </CardTitle>
        <CardDescription>{missing.length > 0 ? t("subtitle") : t("allWritten")}</CardDescription>
      </CardHeader>
      {missing.length > 0 ? (
        <div className="min-h-0 overflow-y-auto">
          <List>
            {missing.map((lesson) => {
              const key = journalEntryKey(lesson.classId, lesson.subjectId, lesson.date);
              const title = [
                data.subjectMap.get(lesson.subjectId)?.name,
                data.classMap.get(lesson.classId)?.name,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <ListRow
                  key={key}
                  data-testid={`journal-backlog-${key}`}
                  leading={
                    <span className="w-20 shrink-0 text-caption whitespace-nowrap text-fg-muted">
                      {dayLabel(lesson.date)}
                    </span>
                  }
                  title={title}
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<PenLine />}
                      aria-label={t("writeFor", { lesson: title })}
                      onClick={() => {
                        setTarget({
                          classId: lesson.classId,
                          subjectId: lesson.subjectId,
                          date: lesson.date,
                        });
                      }}
                    >
                      {t("writePrimary")}
                    </Button>
                  }
                />
              );
            })}
          </List>
        </div>
      ) : (
        <CardContent className="pt-0">
          <EmptyState
            variant="compact"
            tone="success"
            icon={<CheckCircle2 aria-hidden="true" />}
            title={t("allWrittenTitle")}
          />
        </CardContent>
      )}

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent title={t("fillAction")}>
          {target !== null && (
            <JournalForm
              prefillClassId={target.classId}
              prefillSubjectId={target.subjectId}
              prefillDate={target.date}
              onDone={() => {
                setTarget(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
