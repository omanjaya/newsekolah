"use client";

import type { components } from "@newsekolah/api-client";
import { Button, HeroCard, Stat, StatGrid } from "@newsekolah/ui";
import { CircleDashed, ClipboardList, RotateCw, UserX, UsersRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, type ReactElement } from "react";

import { SharedRetry } from "../../../components/query-error";
import { useFocusAfterRetry } from "../../../lib/hooks/use-focus-after-retry";
import { isNoLessonDay } from "../../attendance/lib/attendance-stats";

import { HomeroomDashboard } from "./homeroom-dashboard";
import { isOutsideHomeroomTerm, useLongDayLabel } from "./homeroom-out-of-term";
import { readFailure } from "./homeroom-queue-card";

type Entry = components["schemas"]["AttendanceHomeroomEntry"];
type LeaveRequestSummary = components["schemas"]["LeaveRequestSummary"];

/** The bits of a query result the overview reads. */
export interface OverviewRead {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** The status codes a stat cell or the hero opens in class attendance. */
export type AttentionCode = "A" | "INCOMPLETE";

/**
 * "-" while a figure is missing (its read failed, or the day is still to
 * come), so it never reads as zero.
 */
function figure(value: number, missing: boolean): number | string {
  return missing ? "-" : value;
}

/**
 * The homeroom Ringkasan tab: who needs the teacher on the chosen day (the
 * hero), the day's figures, and the three cards. When the day's read
 * fails, the hero says so with one retry for every failed read, the
 * figures read "-" and the cards show the error instead of an all-clear
 * (audit r3-n18). On another day than today the copy names that day
 * (audit r3-n21). A day outside the reader's homeroom term says so, with
 * no retry that could never succeed (audit r5-n5). A day still to come
 * says its lessons have not happened yet: their unrecorded attendance is
 * not "incomplete" and no guardian needs a call (audit r6-n4).
 */
export function HomeroomOverview({
  date,
  today,
  dashboard,
  leaveQueue,
  counts,
  attentionRows,
  disciplineRows,
  pendingLeave,
  showLeave,
  showDiscipline,
  onShowStatus,
  onShowToday,
}: {
  date: string;
  today: string;
  /** The unfiltered read of the class's day. */
  dashboard: OverviewRead;
  leaveQueue: OverviewRead;
  counts: Record<string, number>;
  attentionRows: Entry[];
  disciplineRows: Entry[];
  pendingLeave: LeaveRequestSummary[];
  showLeave: boolean;
  showDiscipline: boolean;
  onShowStatus: (code: AttentionCode) => void;
  /** Steps back to today; left out when the chosen day is today. */
  onShowToday?: () => void;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const common = useTranslations("common");
  const format = useFormatter();
  const region = useRef<HTMLDivElement>(null);

  const failed = dashboard.isError;
  // Not a failure to retry: the reader held no homeroom duty on that day.
  const outOfTerm = failed && isOutsideHomeroomTerm(dashboard.error);
  const leaveFailed = showLeave && leaveQueue.isError;
  const retrying = dashboard.isFetching || (leaveFailed && leaveQueue.isFetching);
  const keepFocus = useFocusAfterRetry(region, retrying, failed && !outOfTerm ? "hero" : null);
  const retry = () => {
    keepFocus();
    void dashboard.refetch();
    if (leaveFailed) void leaveQueue.refetch();
  };

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  // ISO dates compare as strings. A day still to come has had no lessons,
  // so its unrecorded sessions are "not yet": no alpha or incomplete
  // figure to act on, which the cells show as "-" (audit r6-n4).
  const upcoming = date > today;
  const absent = upcoming ? 0 : (counts.A ?? 0);
  const incomplete = upcoming ? 0 : (counts.INCOMPLETE ?? 0);
  const attention = attentionRows.length;
  // A weekend or holiday: nobody needs attention because there was nothing
  // to record, which must not read as everyone accounted for (audit r4-n4).
  const noLessons = !dashboard.isLoading && isNoLessonDay(counts);
  const isToday = date === today;
  const longDayLabel = useLongDayLabel(date);
  const dayLabel = format.dateTime(new Date(`${date}T00:00:00Z`), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  // A calm day gets a neutral eyebrow, not "Perlu perhatian"; another day
  // than today is named, never called "hari ini".
  const calmEyebrow = isToday ? t("today") : dayLabel;
  const attentionEyebrow = isToday
    ? t("attentionTitle")
    : t("attentionTitleOn", { date: dayLabel });

  return (
    // The hero's retry stands for every failed read, so the cards' error
    // boxes leave theirs out while it shows.
    <SharedRetry active={failed && !outOfTerm}>
      <div ref={region} className="flex flex-col gap-6">
        {outOfTerm ? (
          <HeroCard
            tone="neutral"
            eyebrow={calmEyebrow}
            title={t("outOfTermTitle")}
            meta={t("outOfTermMeta", { date: longDayLabel })}
            action={
              onShowToday ? (
                <Button variant="secondary" onClick={onShowToday}>
                  {t("outOfTermAction")}
                </Button>
              ) : undefined
            }
          />
        ) : failed ? (
          <HeroCard
            tone="warning"
            eyebrow={calmEyebrow}
            title={t("loadFailedTitle")}
            meta={t("loadFailedMeta")}
            action={
              <Button
                variant="secondary"
                icon={<RotateCw />}
                loading={retrying}
                onClick={retry}
                data-retry-focus=""
              >
                {common("actions.retry")}
              </Button>
            }
          />
        ) : upcoming && !noLessons ? (
          <HeroCard
            tone="neutral"
            eyebrow={calmEyebrow}
            title={t("upcomingTitle")}
            meta={t("upcomingMeta", { date: longDayLabel })}
            action={
              onShowToday ? (
                <Button variant="secondary" onClick={onShowToday}>
                  {t("upcomingAction")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <HeroCard
            tone={dashboard.isLoading || attention === 0 ? "accent-soft" : "warning"}
            eyebrow={attention > 0 ? attentionEyebrow : calmEyebrow}
            title={
              attention > 0
                ? t("attentionCount", { count: attention })
                : noLessons
                  ? t("noLessonsTitle")
                  : t("attentionNoneTitle")
            }
            meta={
              attention > 0
                ? t("attentionBreakdown", { absent, incomplete })
                : noLessons
                  ? isToday
                    ? t("noLessonsMeta")
                    : t("noLessonsMetaOn", { date: longDayLabel })
                  : t("attentionEmpty")
            }
            action={
              attention > 0 ? (
                // The status filter matches one code, so the hero opens the
                // list that has rows: alpha first (the guardian needs a
                // call), else the students whose attendance is not complete
                // yet. The two stat cells open each list on its own (audit
                // teaching-1).
                <Button
                  variant="secondary"
                  onClick={() => {
                    onShowStatus(absent > 0 ? "A" : "INCOMPLETE");
                  }}
                >
                  {t("attentionOpen")}
                </Button>
              ) : undefined
            }
          />
        )}

        <StatGrid variant="strip" aria-label={t("statsLabel")}>
          <Stat
            icon={<UsersRound />}
            tone="blue"
            value={figure(total, failed)}
            label={t("statTotal")}
          />
          <Stat
            icon={<UserX />}
            tone="red"
            value={figure(absent, failed || upcoming)}
            label={t("statAbsent")}
            onClick={
              absent > 0
                ? () => {
                    onShowStatus("A");
                  }
                : undefined
            }
          />
          <Stat
            icon={<CircleDashed />}
            tone="amber"
            value={figure(incomplete, failed || upcoming)}
            label={t("statIncomplete")}
            onClick={
              incomplete > 0
                ? () => {
                    onShowStatus("INCOMPLETE");
                  }
                : undefined
            }
          />
          {showLeave && (
            <Stat
              icon={<ClipboardList />}
              tone="purple"
              value={figure(pendingLeave.length, leaveFailed)}
              label={t("statPendingLeave")}
            />
          )}
        </StatGrid>

        {/* Out of term the day's cards could only repeat the refusal,
            worded as "only homeroom teachers can see this", which is wrong
            for this reader. The leave queue does not depend on the day, so
            its card stays, with its own retry when it fails. */}
        {(!outOfTerm || showLeave) && (
          <HomeroomDashboard
            attentionRows={attentionRows}
            disciplineRows={disciplineRows}
            pendingLeave={pendingLeave}
            dashboardLoading={dashboard.isLoading}
            leaveLoading={leaveQueue.isLoading}
            dashboardFailure={readFailure(dashboard)}
            leaveFailure={showLeave ? readFailure(leaveQueue) : null}
            showLeave={showLeave}
            showDiscipline={showDiscipline}
            datedHidden={outOfTerm}
          />
        )}
      </div>
    </SharedRetry>
  );
}
