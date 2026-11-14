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
import { useFormatter, useTranslations } from "next-intl";
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
import {
  LONG_WAIT_MINUTES,
  clockInstant,
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

/** Formats a period's wall-clock start or end the way every other time on screen is written ("08.40"). */
function useClockLabel(): (value: string | undefined) => string {
  const format = useFormatter();
  return (value) =>
    value
      ? format.dateTime(clockInstant(value), {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        })
      : "--.--";
}

/**
 * The teacher's day: which session is running or next (feeds the hero and
 * the "pending" tile) and the full ordered list of today's sessions (the
 * task card). A day with nothing left to ask for still gets a calm hero.
 */
export function useTeacherBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardTeaching.teacher");
  const clock = useClockLabel();
  const sessions = useTodaySessionsQuery({ date: todayInZone(me.tenant.timezone) }, active);
  const periods = useAllPeriodsQuery(active);
  const classes = useClassesQuery(active);
  const subjects = useSubjectsQuery(active);
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const periodMap = useLookup(periods.data?.data);

  if (!active) return EMPTY_BLOCK;

  const todaySessions = sessions.data?.data ?? [];
  const ordered = [...todaySessions].sort((a, b) =>
    (periodMap.get(a.start_period_id)?.starts_at ?? "").localeCompare(
      periodMap.get(b.start_period_id)?.starts_at ?? "",
    ),
  );

  const block: PersonaBlock = {
    tiles: [],
    main: [],
    side: [],
    pending: sessions.isLoading || periods.isLoading,
  };
  let runningId: string | undefined;

  if (sessions.isSuccess && periods.isSuccess) {
    const pending = todaySessions.filter((session) => !session.submitted_at);
    // A day without sessions has nothing to fill in: a "0 of 0" tile would
    // only take the place of one that says something.
    if (todaySessions.length > 0) {
      block.tiles.push({
        key: "teacher.pending",
        priority: 90,
        label: t("tiles.pendingLabel"),
        value: String(pending.length),
        hint: t("tiles.pendingHint", { total: todaySessions.length }),
        href: ATTENDANCE_HREF,
        icon: ClipboardCheck,
        tone: "green",
      });
    }

    const ranges: SessionRange[] = todaySessions.map((session) => ({
      session,
      start: parseClock(periodMap.get(session.start_period_id)?.starts_at ?? "00:00"),
      end: parseClock(periodMap.get(session.end_period_id)?.ends_at ?? "00:00"),
    }));
    const now = minutesInZone(businessNow(), me.tenant.timezone);
    // The running session still highlights in the card below even once it is
    // submitted; the hero, though, has nothing left to ask for from it, so it
    // is excluded from the pick and the hero falls through to whatever is
    // still open today (not yet started, or running and unsubmitted).
    runningId = ranges.find((r) => r.start <= now && now < r.end)?.session.id;
    const eligible = ranges.filter(
      (r) => r.start > now || (r.start <= now && now < r.end && !r.session.submitted_at),
    );
    const picked = pickCurrentOrNext(eligible, now);

    if (picked) {
      const { session, start } = picked.item;
      const subjectName = subjectMap.get(session.subject_id)?.name ?? "";
      const className = classMap.get(session.class_id)?.name ?? "";
      const title = [subjectName, className].filter(Boolean).join(" · ");
      const startLabel = clock(periodMap.get(session.start_period_id)?.starts_at);
      const endLabel = clock(periodMap.get(session.end_period_id)?.ends_at);
      const sessionHref = `${ATTENDANCE_HREF}/${session.id}`;

      if (picked.state === "now") {
        // `eligible` only keeps a running session here when it is still
        // unsubmitted, so this branch never needs to re-check that.
        block.hero = {
          key: "teacher.now",
          priority: HERO_PRIORITY.teacherNowPending,
          eyebrow: t("hero.nowEyebrow"),
          title,
          meta: t("hero.nowMeta", { start: startLabel, end: endLabel }),
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
          meta: t("hero.nextMeta", { start: startLabel, end: endLabel }),
          chip:
            wait > LONG_WAIT_MINUTES
              ? t("hero.nextChipAt", { start: startLabel })
              : t("hero.nextChip", splitMinutes(wait)),
          action: { label: t("hero.nextAction"), href: sessionHref },
          secondaryAction: { label: t("hero.scheduleAction"), href: SCHEDULE_HREF },
        };
      }
    } else {
      const allDone = todaySessions.length > 0;
      block.hero = {
        key: "teacher.idle",
        priority: HERO_PRIORITY.teacherIdle,
        tone: "neutral",
        eyebrow: t("hero.idleEyebrow"),
        title: allDone ? t("hero.doneTitle") : t("hero.freeTitle"),
        meta: allDone ? t("hero.doneMeta", { total: todaySessions.length }) : t("hero.freeMeta"),
        action: allDone
          ? { label: t("hero.journalAction"), href: JOURNAL_HREF }
          : { label: t("hero.scheduleAction"), href: SCHEDULE_HREF },
      };
    }
  }

  // A day without lessons keeps the card, but as quiet context in the side
  // column, so another persona's queue leads the main one.
  const noLessons = sessions.isSuccess && todaySessions.length === 0;
  block[noLessons ? "side" : "main"] = [
    {
      key: "teacher.today",
      node: (
        <TeacherTodayCard
          isLoading={sessions.isLoading}
          error={sessions.isError ? sessions.error : null}
          onRetry={() => void sessions.refetch()}
          sessions={ordered}
          classMap={classMap}
          subjectMap={subjectMap}
          periodMap={periodMap}
          runningId={runningId}
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
  onRetry,
  sessions,
  classMap,
  subjectMap,
  periodMap,
  runningId,
  clock,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  sessions: Session[];
  classMap: Map<string, ClassRef>;
  subjectMap: Map<string, SubjectRef>;
  periodMap: Map<string, PeriodRef>;
  runningId?: string;
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
          <EmptyState variant="compact" icon={<CalendarX2 />} title={t("card.empty")} />
        </div>
      ) : (
        <List>
          {sessions.map((session) => {
            const running = session.id === runningId;
            const subject = subjectMap.get(session.subject_id)?.name;
            return (
              <ListRow
                key={session.id}
                href={`${ATTENDANCE_HREF}/${session.id}`}
                leading={
                  <span
                    className={cn(
                      "w-12 text-label tabular-nums",
                      running ? "text-accent" : "text-fg-muted",
                    )}
                  >
                    {clock(periodMap.get(session.start_period_id)?.starts_at)}
                  </span>
                }
                title={classMap.get(session.class_id)?.name ?? "-"}
                meta={
                  running && subject ? t("card.runningMeta", { subject }) : (subject ?? undefined)
                }
                selected={running}
                trailing={
                  session.submitted_at ? (
                    <Badge tone="success" size="sm">
                      {t("card.statusSubmitted")}
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
      )}
    </Card>
  );
}
