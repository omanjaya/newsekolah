"use client";

import { Badge, Button, Skeleton } from "@newsekolah/ui";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan } from "../../../lib/session/session-provider";
import { AnnouncementFeed } from "../../announcements/components/announcement-feed";
import { todayInZone, useTodaySessionsQuery } from "../../attendance/api";
import { useUnreadCountQuery } from "../../notifications/api";
import { useLateArrivalQueueQuery, useLeaveReviewQueueQuery } from "../../permits/api";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { useDashboardData } from "../api";

import { ActionTiles, type ActionTile } from "./action-tiles";
import { AdminDashboardPanel } from "./admin-dashboard-panel";
import { DailyTaskShortcut, selectDailyTask } from "./daily-task-shortcut";
import { ParentChildSummary } from "./parent-child-summary";
import { SectionCard } from "./section-card";
import { TodaySessionsCard } from "./today-sessions-card";

/** School totals lead into personal queues, operational tables, and updates. */
export function DashboardView(): ReactElement {
  const { data: me, isLoading, isError, refetch } = useDashboardData();
  const t = useTranslations("app.dashboard");
  const format = useFormatter();
  const canManageAttendance = useCan("manage_attendance");
  const canReviewLeave = useCan("review_leave_requests");
  const canIssueLeave = useCan("issue_leave_letters");
  const canManageCirculation = useCan("manage_library_circulation");
  const canIssueScanTokens = useCan("issue_scan_tokens");
  const canViewChildren = useCan("view_child_attendance");
  const canViewAcademicData = useCan("view_academic_data");
  const canViewOwnGrades = useCan("view_own_grades");
  const canHandleLeave = canReviewLeave || canIssueLeave;
  const sessions = useTodaySessionsQuery(
    { date: todayInZone(me?.tenant.timezone) },
    canManageAttendance,
  );
  const lateQueue = useLateArrivalQueueQuery(canManageAttendance);
  const leaveQueue = useLeaveReviewQueueQuery(canHandleLeave);
  const unread = useUnreadCountQuery(Boolean(me));
  const classes = useClassesQuery(canManageAttendance);
  const subjects = useSubjectsQuery(canManageAttendance);
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);

  if (isError) return <QueryError retry={() => refetch()} className="m-4" />;

  if (isLoading || !me) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const taskQueries = [
    unread,
    ...(canManageAttendance ? [sessions, lateQueue] : []),
    ...(canHandleLeave ? [leaveQueue] : []),
  ];
  const tasksFailed = taskQueries.some((query) => query.isError);
  const tasksLoading = taskQueries.some((query) => query.isLoading);
  const todaySessions = sessions.data?.data ?? [];
  const pendingSessions = todaySessions.filter((s) => !s.submitted_at);
  const dailyTask = selectDailyTask({
    canManageAttendance,
    canManageCirculation,
    canIssueScanTokens,
    canViewChildren,
    canViewAcademicData,
    canViewOwnGrades,
    profileKind: me.profile_kind,
  });
  const tiles: ActionTile[] = [
    ...(canManageAttendance
      ? [
          {
            key: "attendance",
            href: "/attendance",
            label: t("tiles.attendance.label"),
            count: pendingSessions.length,
            hint: t("tiles.attendance.hint", { total: todaySessions.length }),
          },
          {
            key: "late",
            href: "/late-arrivals",
            label: t("tiles.late.label"),
            count: lateQueue.data?.data.length ?? 0,
            hint: t("tiles.late.hint"),
          },
        ]
      : []),
    ...(canHandleLeave
      ? [
          {
            key: "leave",
            href: "/leave-requests",
            label: t("tiles.leave.label"),
            count: leaveQueue.data?.data.length ?? 0,
            hint: t("tiles.leave.hint"),
          },
        ]
      : []),
    {
      key: "notifications",
      href: "/notifications",
      label: t("tiles.notifications.label"),
      count: unread.data?.count ?? 0,
      hint: t("tiles.notifications.hint"),
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="mb-1 text-[12px] text-fg-muted">
            {t("title")} ·{" "}
            {format.dateTime(new Date(), {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: me.tenant.timezone,
            })}
          </p>
          <h1 className="text-[24px] leading-tight font-medium tracking-tight text-fg">
            {t("greeting", { name: me.name })}
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">{t("overviewNote")}</p>
        </div>
        <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {me.roles.map((role) => (
              <Badge key={role.id} variant="neutral">
                {role.name}
              </Badge>
            ))}
          </div>
          <p className="text-[12px] text-fg-muted">
            {me.active_academic_year?.label ?? t("noAcademicYear")}
          </p>
        </div>
      </header>

      <AdminDashboardPanel roles={me.roles} section="summary" />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {dailyTask && dailyTask !== "attendance" && <DailyTaskShortcut task={dailyTask} />}
          {me.profile_kind === "parent" && canViewChildren && (
            <ParentChildSummary timeZone={me.tenant.timezone} />
          )}
          <SectionCard title={t("tasksTitle")} note={t("tasksNote")}>
            {tasksFailed ? (
              <QueryError retry={() => Promise.all(taskQueries.map((query) => query.refetch()))} />
            ) : tasksLoading ? (
              <Skeleton className="h-32 w-full" aria-busy="true" />
            ) : (
              <ActionTiles tiles={tiles} clearLabel={t("tasksClear")} />
            )}
          </SectionCard>
          {canManageAttendance && (sessions.isLoading || todaySessions.length > 0) && (
            <TodaySessionsCard
              sessions={todaySessions}
              isLoading={sessions.isLoading}
              classMap={classMap}
              subjectMap={subjectMap}
              enabled={canManageAttendance}
            />
          )}
          <AdminDashboardPanel roles={me.roles} section="queue" />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title={t("announcementsTitle")}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/announcements">{t("openAnnouncements")}</Link>
              </Button>
            }
          >
            <AnnouncementFeed limit={3} compact />
          </SectionCard>
          <AdminDashboardPanel roles={me.roles} section="activity" />
        </div>
      </div>
      <p className="border-t border-border pt-3 text-[12px] text-fg-muted">{t("footerHint")}</p>
    </div>
  );
}
