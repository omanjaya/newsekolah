"use client";

import type { components } from "@newsekolah/api-client";
import { Button, HeroCard, Stat, StatGrid } from "@newsekolah/ui";
import { CircleDashed, ClipboardList, RotateCw, UserX, UsersRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, type ReactElement } from "react";

import { SharedRetry } from "../../../components/query-error";
import { useFocusAfterRetry } from "../../../lib/hooks/use-focus-after-retry";

import { HomeroomDashboard } from "./homeroom-dashboard";
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

/** "-" while a figure's read failed, so a failure never reads as zero. */
function figure(value: number, failed: boolean): number | string {
  return failed ? "-" : value;
}

/**
 * The homeroom Ringkasan tab: who needs the teacher on the chosen day (the
 * hero), the day's figures, and the three cards. When the day's read
 * fails, the hero says so with one retry for every failed read, the
 * figures read "-" and the cards show the error instead of an all-clear
 * (audit r3-n18). On another day than today the copy names that day
 * (audit r3-n21).
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
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const common = useTranslations("common");
  const format = useFormatter();
  const region = useRef<HTMLDivElement>(null);

  const failed = dashboard.isError;
  const leaveFailed = showLeave && leaveQueue.isError;
  const retrying = dashboard.isFetching || (leaveFailed && leaveQueue.isFetching);
  const keepFocus = useFocusAfterRetry(region, retrying, failed ? "hero" : null);
  const retry = () => {
    keepFocus();
    void dashboard.refetch();
    if (leaveFailed) void leaveQueue.refetch();
  };

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const absent = counts.A ?? 0;
  const incomplete = counts.INCOMPLETE ?? 0;
  const attention = attentionRows.length;
  const isToday = date === today;
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
    <SharedRetry active={failed}>
      <div ref={region} className="flex flex-col gap-6">
        {failed ? (
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
        ) : (
          <HeroCard
            tone={dashboard.isLoading || attention === 0 ? "accent-soft" : "warning"}
            eyebrow={attention > 0 ? attentionEyebrow : calmEyebrow}
            title={
              attention > 0 ? t("attentionCount", { count: attention }) : t("attentionNoneTitle")
            }
            meta={
              attention > 0 ? t("attentionBreakdown", { absent, incomplete }) : t("attentionEmpty")
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
            value={figure(absent, failed)}
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
            value={figure(incomplete, failed)}
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
        />
      </div>
    </SharedRetry>
  );
}
