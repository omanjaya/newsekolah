"use client";

import type { components } from "@newsekolah/api-client";
import { Badge, Card, CardHeader, CardTitle, Skeleton } from "@newsekolah/ui";
import { Activity, ArrowUpRight, ClipboardCheck, Inbox, Users } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { useAtRiskStudentsQuery } from "../../../analytics/api";
import { RiskLevelBadge } from "../../../analytics/components/risk-level-badge";
import {
  type ClassRef,
  type DirectoryUser,
  useClassesQuery,
  useDirectoryQuery,
  useLookup,
} from "../../../reference/api";
import { studentProfileHref } from "../../../students/href";
import { useAdminDashboardQuery } from "../../api";
import {
  EMPTY_BLOCK,
  HERO_PRIORITY,
  type BlockSlot,
  type Me,
  type PersonaBlock,
  type TileSpec,
} from "../types";

import { LoginActivityChart } from "./login-activity-chart";
import { PresenceCard } from "./presence-card";

type AdminDashboard = components["schemas"]["AdminDashboard"];
type StudentRisk = components["schemas"]["StudentRisk"];

const MONITOR_HREF = "/monitor";
const ANALYTICS_HREF = "/analytics";

/** Same three workflow queues `admin-dashboard-panel.tsx` (removed in Task 7) listed. */
const PENDING_LINKS = [
  { key: "leave_request", href: "/leave-requests" },
  { key: "exit_permit", href: "/exit-permits" },
  { key: "late_arrival", href: "/late-arrivals" },
] as const;

/**
 * School leadership (admin/super_admin/principal): the operational snapshot
 * from `GET /v1/analytics/admin-dashboard` (same restriction, see that
 * endpoint's `isAdminCaller`) plus the early-warning list, top 5 by score.
 * Moves the queue table and login histogram out of the deleted
 * `admin-dashboard-panel.tsx` rather than duplicating them (Task 5 of
 * docs/superpowers/plans/2026-09-26-dashboard-per-peran.md).
 */
export function useLeadershipBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardSchool.leadership");
  const dashboard = useAdminDashboardQuery(active);
  // GET /v1/analytics/at-risk-students requires view_early_warning, which
  // the admin/principal seed accounts do not hold (it returns 403 for
  // them): the query only runs, and the card only renders, for a caller who
  // actually has it.
  const canViewAtRisk = me.permissions.includes("view_early_warning");
  const canViewMonitor = me.permissions.includes("view_monitor_presence");
  const atRisk = useAtRiskStudentsQuery(active && canViewAtRisk);
  const students = useDirectoryQuery("student", active);
  const studentMap = useLookup(students.data?.data);
  const classes = useClassesQuery(active);
  const classMap = useLookup(classes.data?.data);

  if (!active) return EMPTY_BLOCK;

  const data = dashboard.data;
  const ready = !dashboard.isLoading && !dashboard.isError && Boolean(data);
  const attendanceToday = data?.attendance_today;

  const hero =
    ready && data && attendanceToday && attendanceToday.total > 0
      ? {
          key: "school.summary",
          priority: HERO_PRIORITY.schoolSummary,
          eyebrow: t("hero.eyebrow"),
          title: t("hero.title", {
            submitted: attendanceToday.submitted,
            total: attendanceToday.total,
          }),
          meta: t("hero.meta", { pending: attendanceToday.total - attendanceToday.submitted }),
          action: { label: t("hero.action"), href: MONITOR_HREF },
        }
      : undefined;

  const tiles: TileSpec[] = [];
  if (ready && data) {
    if (attendanceToday) {
      tiles.push({
        key: "school.sessions",
        priority: 80,
        label: t("tiles.sessions"),
        value: `${attendanceToday.submitted}/${attendanceToday.total}`,
        icon: ClipboardCheck,
        tone: "green",
        href: MONITOR_HREF,
      });
    }
    tiles.push({
      key: "school.pending",
      priority: 75,
      label: t("tiles.pending"),
      value: String(
        data.pending.leave_request + data.pending.exit_permit + data.pending.late_arrival,
      ),
      icon: Inbox,
      tone: "amber",
    });
    tiles.push({
      key: "school.users",
      priority: 50,
      label: t("tiles.users"),
      value: String(Object.values(data.active_users).reduce((sum, count) => sum + count, 0)),
      icon: Users,
      tone: "blue",
    });
    tiles.push({
      key: "school.online",
      priority: 40,
      label: t("tiles.online"),
      value: String(Object.values(data.online_by_role).reduce((sum, count) => sum + count, 0)),
      icon: Activity,
      tone: "purple",
    });
  }

  const atRiskRows = [...(atRisk.data?.data ?? [])].sort((a, b) => b.score - a.score).slice(0, 5);

  const left: BlockSlot[] = [
    {
      key: "school.queue",
      node: (
        <SchoolQueueCard
          key="school.queue"
          isLoading={dashboard.isLoading}
          isError={dashboard.isError}
          refetch={dashboard.refetch}
          data={data}
        />
      ),
    },
    ...(canViewMonitor
      ? [
          {
            key: "school.presence",
            node: (
              <PresenceCard
                key="school.presence"
                isLoading={dashboard.isLoading}
                isError={dashboard.isError}
                refetch={dashboard.refetch}
                attendance={attendanceToday}
              />
            ),
          },
        ]
      : []),
  ];

  const right: BlockSlot[] = [
    {
      key: "school.activity",
      node: (
        <SchoolActivityCard
          key="school.activity"
          isLoading={dashboard.isLoading}
          isError={dashboard.isError}
          refetch={dashboard.refetch}
          data={data}
        />
      ),
    },
    ...(canViewAtRisk
      ? [
          {
            key: "school.atRisk",
            node: (
              <AtRiskCard
                key="school.atRisk"
                isLoading={atRisk.isLoading}
                isError={atRisk.isError}
                refetch={atRisk.refetch}
                rows={atRiskRows}
                studentMap={studentMap}
                classMap={classMap}
              />
            ),
          },
        ]
      : []),
  ];

  return { hero, tiles, left, right };
}

function SchoolQueueCard({
  isLoading,
  isError,
  refetch,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  data: AdminDashboard | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.leadership.queue");
  const format = useFormatter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        {isError ? (
          <QueryError retry={refetch} />
        ) : isLoading || !data ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-bg text-left">
                  <th scope="col" className="px-4 py-3 text-[12px] font-semibold text-fg-muted">
                    {t("type")}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[12px] font-semibold text-fg-muted"
                  >
                    {t("count")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t("open")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {PENDING_LINKS.map(({ key, href }) => (
                  <tr key={key} className="border-b border-line last:border-b-0 hover:bg-bg">
                    <th scope="row" className="px-4 py-3 text-left font-normal text-fg">
                      {t(`labels.${key}`)}
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Badge variant={data.pending[key] > 0 ? "accent" : "neutral"}>
                        {format.number(data.pending[key])}
                      </Badge>
                    </td>
                    <td className="w-11 px-4 py-3 text-right">
                      <Link
                        href={href}
                        aria-label={`${t("open")}: ${t(`labels.${key}`)}`}
                        className="inline-flex size-11 items-center justify-center rounded-xs text-fg-muted hover:bg-bg hover:text-fg"
                      >
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function SchoolActivityCard({
  isLoading,
  isError,
  refetch,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  data: AdminDashboard | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.leadership.activity");
  const format = useFormatter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        {isError ? (
          <QueryError retry={refetch} />
        ) : isLoading || !data ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : (
          <>
            <LoginActivityChart values={data.login_histogram} />
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[12px] text-fg-muted">
              <span className="font-medium text-fg">{t("onlineTitle")}</span>
              {(() => {
                const onlineRoles = Object.entries(data.online_by_role)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a);
                return onlineRoles.length === 0 ? (
                  <span>{t("onlineEmpty")}</span>
                ) : (
                  onlineRoles.map(([role, count]) => (
                    <span key={role}>
                      <span className="tabular-nums text-fg">{format.number(count)}</span>{" "}
                      {t.has(`roleNames.${role}`) ? t(`roleNames.${role}`) : role}
                    </span>
                  ))
                );
              })()}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function AtRiskCard({
  isLoading,
  isError,
  refetch,
  rows,
  studentMap,
  classMap,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  rows: StudentRisk[];
  studentMap: Map<string, DirectoryUser>;
  classMap: Map<string, ClassRef>;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.leadership.atRisk");
  const levelLabel = useTranslations("app.analytics.level");

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t("title")}</CardTitle>
        <Link
          href={ANALYTICS_HREF}
          className="shrink-0 text-[13px] text-accent underline underline-offset-2"
        >
          {t("viewAll")}
        </Link>
      </CardHeader>
      <div className="px-5 pb-5">
        {isError ? (
          <QueryError retry={refetch} />
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.student_user_id}>
                <Link
                  href={studentProfileHref(row.student_user_id)}
                  className="flex items-center justify-between gap-3 text-[13px] text-fg hover:text-accent"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">
                      {studentMap.get(row.student_user_id)?.name ?? t("unknownStudent")}
                    </span>
                    <span className="truncate text-fg-muted">
                      {classMap.get(row.class_id)?.name ?? "-"}
                    </span>
                  </span>
                  <RiskLevelBadge level={row.level} label={levelLabel(row.level)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
