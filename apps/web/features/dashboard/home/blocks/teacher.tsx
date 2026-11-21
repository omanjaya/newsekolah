"use client";

import type { components } from "@newsekolah/api-client";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  TextLink,
  cn,
} from "@newsekolah/ui";
import { CalendarX2, ClipboardCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { businessNow } from "../../../../lib/simulation/clock";
import { todayInZone, useTodaySessionsQuery } from "../../../attendance/api";
import {
  useAllPeriodsQuery,
  useClassesQuery,
  useLookup,
  useSubjectsQuery,
  type ClassRef,
  type PeriodRef,
  type SubjectRef,
} from "../../../reference/api";
import { clockLabel, clockRange } from "../../../schedule/clock-label";
import {
  LONG_WAIT_MINUTES,
  minutesInZone,
  parseClock,
  pickCurrentOrNext,
  splitMinutes,
  type TimeRange,
} from "../time";
import { EMPTY_BLOCK, HERO_PRIORITY, type Me, type PersonaBlock } from "../types";

type Session = components["schemas"]["AttendanceSessionSummary"];

interface SessionRange extends TimeRange {
  session: Session;
}

const ATTENDANCE_HREF = "/attendance";
const SCHEDULE_HREF = "/schedule";
const JOURNAL_HREF = "/journal";
const VIEW_ACADEMIC_DATA = "view_academic_data";

/** A lesson an accepted substitute fills instead: never this teacher's to-do. */
function isHandedOver(session: Session): boolean {
  return Boolean(session.handed_over_to_user_id);
}

/**
 * Formats a period's wall-clock start or end, and a lesson's span, the way
 * the schedule and attendance write them ("08.40", "07.00 – 08.40"), so the
 * same lesson reads the same one tap away from home.
 */
function useClockLabels(): {
  clock: (value: string | undefined) => string;
  range: (start: string | undefined, end: string | undefined) => string;
} {
  const locale = useLocale();
  const clock = (value: string | undefined) => (value ? clockLabel(value, locale) : "--.--");
  return {
    clock,
    range: (start, end) =>
      start && end ? clockRange(start, end, locale) : `${clock(start)} – ${clock(end)}`,
  };
}

/**
 * The teacher's day: which session is running or next (feeds the hero and
 * the "pending" tile) and the full ordered list of today's sessions (the
 * task card). A day with nothing left to ask for still gets a calm hero.
 */
export function useTeacherBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardTeaching.teacher");
  const { clock, range } = useClockLabels();
  const sessions = useTodaySessionsQuery({ date: todayInZone(me.tenant.timezone) }, active);
  const periods = useAllPeriodsQuery(active);
  // The class and subject names only dress the hero and the card's rows,
  // and their lists need view_academic_data, which the teacher persona
  // (manage_attendance) does not imply. Without it they are not read at
  // all, so a role that lacks it gets a home it can load instead of a
  // 403 no retry can fix.
  const canReadNames = me.permissions.includes(VIEW_ACADEMIC_DATA);
  const classes = useClassesQuery(active && canReadNames);
  const subjects = useSubjectsQuery(active && canReadNames);
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const periodMap = useLookup(periods.data?.data);

  if (!active) return EMPTY_BLOCK;

  const todaySessions = sessions.data?.data ?? [];
  // A holiday in the academic calendar has no lessons to fill, and says
  // which holiday it is instead of reading as an ordinary free day.
  const holidayName = sessions.data?.holiday_name;
  const ordered = [...todaySessions].sort((a, b) =>
    (periodMap.get(a.start_period_id)?.starts_at ?? "").localeCompare(
      periodMap.get(b.start_period_id)?.starts_at ?? "",
    ),
  );

  // Every read the hero, the tile and the card stand on. A failed class or
  // subject read fails the block, so the home says so with its one retry
  // (audit r3-n19), but it only takes the names away: the lesson that waits
  // for attendance keeps its hero and its row, named by its period, rather
  // than hiding behind the notice (audit r4-n3). A name read that never
  // runs (no permission, or the classes list waiting on an active school
  // year) is not a failure: the lesson is named by what is known.
  const nameReads = canReadNames ? [classes, subjects] : [];
  const reads = [sessions, periods, ...nameReads];
  const dayError: unknown = [sessions, periods].find((read) => read.isError)?.error ?? null;
  const namesError: unknown = nameReads.find((read) => read.isError)?.error ?? null;
  const block: PersonaBlock = {
    tiles: [],
    main: [],
    side: [],
    pending: reads.some((read) => read.isLoading),
    failed: reads.some((read) => read.isError),
  };
  // The running lesson by its schedule: one the time simulation has reached
  // before the real day has no session yet (the list does not open it), so
  // it has no id, yet it is still the one running.
  let runningScheduleId: string | undefined;
  // One retry for the card: it refetches whichever of its reads failed.
  const retryFailed = () => {
    for (const read of reads) if (read.isError) void read.refetch();
  };

  if (sessions.isSuccess && periods.isSuccess) {
    // A lesson handed to a substitute is theirs to fill: it is neither
    // pending nor the hero here, only a row in the card that says so.
    const ownSessions = todaySessions.filter((session) => !isHandedOver(session));
    const pending = ownSessions.filter((session) => !session.submitted_at);
    // A day without sessions of one's own has nothing to fill in: a
    // "0 of 0" tile would only take the place of one that says something.
    if (ownSessions.length > 0) {
      block.tiles.push({
        key: "teacher.pending",
        priority: 90,
        label: t("tiles.pendingLabel"),
        value: String(pending.length),
        hint: t("tiles.pendingHint", { total: ownSessions.length }),
        href: ATTENDANCE_HREF,
        icon: ClipboardCheck,
        tone: "green",
      });
    }

    const ranges: SessionRange[] = ownSessions.map((session) => ({
      session,
      start: parseClock(periodMap.get(session.start_period_id)?.starts_at ?? "00:00"),
      end: parseClock(periodMap.get(session.end_period_id)?.ends_at ?? "00:00"),
    }));
    const now = minutesInZone(businessNow(), me.tenant.timezone);
    // The running session still highlights in the card below even once it is
    // submitted; the hero, though, has nothing left to ask for from it, so it
    // is excluded from the pick and the hero falls through to whatever is
    // still open today (not yet started, or running and unsubmitted).
    runningScheduleId = ranges.find((r) => r.start <= now && now < r.end)?.session.schedule_id;
    const eligible = ranges.filter(
      (r) => r.start > now || (r.start <= now && now < r.end && !r.session.submitted_at),
    );
    const picked = pickCurrentOrNext(eligible, now);

    // The hero names the lesson with whichever of the subject and class is
    // known, and with its period when neither is.
    if (picked) {
      const { session, start } = picked.item;
      const startPeriod = periodMap.get(session.start_period_id);
      const subjectName = subjectMap.get(session.subject_id)?.name ?? "";
      const className = classMap.get(session.class_id)?.name ?? "";
      const title =
        [subjectName, className].filter(Boolean).join(" · ") || (startPeriod?.name ?? "");
      const startsAt = startPeriod?.starts_at;
      const startLabel = clock(startsAt);
      const rangeLabel = range(startsAt, periodMap.get(session.end_period_id)?.ends_at);
      const sessionHref = session.id ? `${ATTENDANCE_HREF}/${session.id}` : ATTENDANCE_HREF;

      if (picked.state === "now") {
        // `eligible` only keeps a running session here when it is still
        // unsubmitted, so this branch never needs to re-check that.
        block.hero = {
          key: "teacher.now",
          priority: HERO_PRIORITY.teacherNowPending,
          eyebrow: t("hero.nowEyebrow"),
          title,
          meta: t("hero.nowMeta", { range: rangeLabel }),
          chip: t("hero.nowChip", splitMinutes(now - start)),
          live: true,
          action: { label: t("hero.nowAction"), href: sessionHref },
        };
      } else {
        const wait = start - now;
        block.hero = {
          key: "teacher.next",
          priority: HERO_PRIORITY.teacherNext,
          eyebrow: t("hero.nextEyebrow"),
          title,
          meta: t("hero.nextMeta", { range: rangeLabel }),
          chip:
            wait > LONG_WAIT_MINUTES
              ? t("hero.nextChipAt", { start: startLabel })
              : t("hero.nextChip", splitMinutes(wait)),
          action: { label: t("hero.nextAction"), href: sessionHref },
          secondaryAction: { label: t("hero.scheduleAction"), href: SCHEDULE_HREF },
        };
      }
    } else {
      const allDone = ownSessions.length > 0;
      // Every lesson today went to a substitute: nothing is left to fill.
      const allHandedOver = !allDone && todaySessions.length > 0;
      const holiday = !allDone && !allHandedOver && holidayName;
      block.hero = {
        key: "teacher.idle",
        priority: HERO_PRIORITY.teacherIdle,
        tone: "neutral",
        eyebrow: t("hero.idleEyebrow"),
        title: allDone
          ? t("hero.doneTitle")
          : allHandedOver
            ? t("hero.handedOverTitle")
            : holiday
              ? t("hero.holidayTitle", { name: holidayName })
              : t("hero.freeTitle"),
        meta: allDone
          ? t("hero.doneMeta", { total: ownSessions.length })
          : allHandedOver
            ? t("hero.handedOverMeta")
            : holiday
              ? t("hero.holidayMeta")
              : t("hero.freeMeta"),
        action: allDone
          ? { label: t("hero.journalAction"), href: JOURNAL_HREF }
          : { label: t("hero.scheduleAction"), href: SCHEDULE_HREF },
      };
    }
  }

  // A day without lessons keeps the card, but as quiet context in the side
  // column, so another persona's queue leads the main one. When no queue
  // card leads it, the home moves the card back to the main column
  // (dashboard-view.tsx), so the wide column never ends at the tiles.
  const noLessons = sessions.isSuccess && todaySessions.length === 0;
  block[noLessons ? "side" : "main"] = [
    {
      key: "teacher.today",
      node: (
        <TeacherTodayCard
          isLoading={block.pending === true}
          error={dayError}
          namesError={namesError}
          onRetry={retryFailed}
          sessions={ordered}
          holidayName={holidayName}
          classMap={classMap}
          subjectMap={subjectMap}
          periodMap={periodMap}
          runningScheduleId={runningScheduleId}
          clock={clock}
        />
      ),
    },
  ];

  return block;
}

function TeacherTodayCard({
  isLoading,
  error,
  namesError,
  onRetry,
  sessions,
  holidayName,
  classMap,
  subjectMap,
  periodMap,
  runningScheduleId,
  clock,
}: {
  isLoading: boolean;
  /** Today's sessions or periods failed: there are no rows to show. */
  error: unknown;
  /** The class or subject names failed: the rows show, named by period. */
  namesError: unknown;
  onRetry: () => void;
  sessions: Session[];
  /** The academic calendar's holiday that cancelled today's lessons. */
  holidayName?: string;
  classMap: Map<string, ClassRef>;
  subjectMap: Map<string, SubjectRef>;
  periodMap: Map<string, PeriodRef>;
  runningScheduleId?: string;
  clock: (value: string | undefined) => string;
}): ReactElement {
  const t = useTranslations("app.dashboardTeaching.teacher");
  return (
    <Card>
      <CardHeader action={<TextLink href={ATTENDANCE_HREF}>{t("card.action")}</TextLink>}>
        <CardTitle as="h2">{t("card.title")}</CardTitle>
      </CardHeader>
      {isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={3} framed={false} />
        </div>
      ) : error ? (
        <div className="px-5 pb-5">
          <QueryError retry={onRetry} error={error} />
        </div>
      ) : sessions.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            variant="compact"
            icon={<CalendarX2 />}
            title={holidayName ? t("card.holiday", { name: holidayName }) : t("card.empty")}
          />
        </div>
      ) : (
        <>
          {namesError ? (
            <div className="px-5 pb-3">
              <QueryError retry={onRetry} error={namesError} />
            </div>
          ) : null}
          <List>
            {sessions.map((session) => {
              const running = session.schedule_id === runningScheduleId;
              const subject = subjectMap.get(session.subject_id)?.name;
              const startPeriod = periodMap.get(session.start_period_id);
              return (
                <ListRow
                  key={session.schedule_id}
                  href={session.id ? `${ATTENDANCE_HREF}/${session.id}` : ATTENDANCE_HREF}
                  leading={
                    <span
                      className={cn(
                        "w-12 text-label tabular-nums",
                        running ? "text-accent" : "text-fg-muted",
                      )}
                    >
                      {clock(startPeriod?.starts_at)}
                    </span>
                  }
                  title={classMap.get(session.class_id)?.name ?? startPeriod?.name ?? "-"}
                  meta={
                    running && subject ? t("card.runningMeta", { subject }) : (subject ?? undefined)
                  }
                  selected={running}
                  trailing={
                    session.submitted_at ? (
                      <Badge tone="success" size="sm">
                        {t("card.statusSubmitted")}
                      </Badge>
                    ) : isHandedOver(session) ? (
                      <Badge tone="neutral" size="sm">
                        {t("card.statusHandedOver")}
                      </Badge>
                    ) : (
                      <Badge tone="warning" size="sm">
                        {t("card.statusPending")}
                      </Badge>
                    )
                  }
                />
              );
            })}
          </List>
        </>
      )}
    </Card>
  );
}
