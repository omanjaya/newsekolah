"use client";

import type { components } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from "@newsekolah/ui";
import { Check, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
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
import { minutesInZone, parseClock, pickCurrentOrNext, type TimeRange } from "../time";
import { EMPTY_BLOCK, HERO_PRIORITY, type Me, type PersonaBlock } from "../types";

type Session = components["schemas"]["AttendanceSessionSummary"];

interface SessionRange extends TimeRange {
  session: Session;
}

/**
 * The teacher's day: which session is running or next (feeds the hero and
 * the "pending" tile) and the full ordered list of today's sessions (the
 * left column card). Mirrors the read `today-sessions-card.tsx` used to do,
 * now folded into one persona block per docs/superpowers/plans/2026-09-26-
 * dashboard-per-peran.md Task 3.
 */
export function useTeacherBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardTeaching.teacher");
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

  const block: PersonaBlock = { tiles: [], left: [], right: [] };
  let runningId: string | undefined;

  if (sessions.isSuccess && periods.isSuccess) {
    const pending = todaySessions.filter((session) => !session.submitted_at);
    block.tiles.push({
      key: "teacher.pending",
      priority: 90,
      label: t("tiles.pendingLabel"),
      value: String(pending.length),
      hint: t("tiles.pendingHint", { total: todaySessions.length }),
      href: "/attendance",
      icon: ClipboardCheck,
      tone: "green",
    });

    const ranges: SessionRange[] = todaySessions.map((session) => ({
      session,
      start: parseClock(periodMap.get(session.start_period_id)?.starts_at ?? "00:00"),
      end: parseClock(periodMap.get(session.end_period_id)?.ends_at ?? "00:00"),
    }));
    const now = minutesInZone(new Date(), me.tenant.timezone);
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
      const startLabel = periodMap.get(session.start_period_id)?.starts_at ?? "--:--";
      const endLabel = periodMap.get(session.end_period_id)?.ends_at ?? "--:--";

      if (picked.state === "now") {
        // `eligible` only keeps a running session here when it is still
        // unsubmitted, so this branch never needs to re-check that.
        block.hero = {
          key: "teacher.now",
          priority: HERO_PRIORITY.teacherNowPending,
          eyebrow: t("hero.nowEyebrow"),
          title,
          meta: t("hero.nowMeta", { start: startLabel, end: endLabel }),
          chip: t("hero.nowChip", { minutes: Math.max(0, now - start) }),
          action: { label: t("hero.nowAction"), href: "/attendance" },
        };
      } else {
        block.hero = {
          key: "teacher.next",
          priority: HERO_PRIORITY.teacherNext,
          eyebrow: t("hero.nextEyebrow"),
          title,
          meta: t("hero.nextMeta", { start: startLabel, end: endLabel }),
          chip: t("hero.nextChip", { minutes: Math.max(0, start - now) }),
          action: { label: t("hero.nextAction"), href: "/attendance" },
        };
      }
    }
  }

  block.left = [
    {
      key: "teacher.today",
      node: (
        <TeacherTodayCard
          isLoading={sessions.isLoading}
          isError={sessions.isError}
          onRetry={() => void sessions.refetch()}
          sessions={ordered}
          classMap={classMap}
          subjectMap={subjectMap}
          periodMap={periodMap}
          runningId={runningId}
          t={t}
        />
      ),
    },
  ];

  return block;
}

function TeacherTodayCard({
  isLoading,
  isError,
  onRetry,
  sessions,
  classMap,
  subjectMap,
  periodMap,
  runningId,
  t,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  sessions: Session[];
  classMap: Map<string, ClassRef>;
  subjectMap: Map<string, SubjectRef>;
  periodMap: Map<string, PeriodRef>;
  runningId?: string;
  t: ReturnType<typeof useTranslations>;
}): ReactElement {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{t("card.title")}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/attendance">{t("card.action")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-20 w-full" aria-busy="true" />
        ) : isError ? (
          <QueryError retry={onRetry} />
        ) : sessions.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("card.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {sessions.map((session) => {
              const running = session.id === runningId;
              return (
                <li
                  key={session.id}
                  className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 py-2"
                >
                  <span
                    className={cn(
                      "text-[13px] tabular-nums",
                      running ? "font-bold text-accent" : "text-fg-muted",
                    )}
                  >
                    {periodMap.get(session.start_period_id)?.starts_at ?? "--:--"}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[14px]",
                        running ? "font-bold text-accent" : "text-fg",
                      )}
                    >
                      {classMap.get(session.class_id)?.name ?? "-"}
                    </span>
                    <span className="block truncate text-[13px] text-fg-muted">
                      {subjectMap.get(session.subject_id)?.name ?? ""}
                    </span>
                  </span>
                  {session.submitted_at ? (
                    <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
                      <Check className="size-4" aria-hidden="true" />
                      {t("card.statusSubmitted")}
                    </span>
                  ) : (
                    <Badge variant="accent">{t("card.statusPending")}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
