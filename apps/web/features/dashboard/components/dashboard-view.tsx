"use client";

import { Badge, Button, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import { ArrowRight, Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { AnnouncementFeed } from "../../announcements/components/announcement-feed";
import { todayInZone, useTodaySessionsQuery } from "../../attendance/api";
import { useUnreadCountQuery } from "../../notifications/api";
import { useLateArrivalQueueQuery, useLeaveReviewQueueQuery } from "../../permits/api";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { useDashboardData } from "../api";

import { AdminDashboardPanel } from "./admin-dashboard-panel";

/** Shared card shell for a dashboard section; also used by AdminDashboardPanel. */
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-medium text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Role-aware home (docs/07-ui-ux.md section 3): the "now" card with today's
 * sessions, the task queue (unsubmitted attendance, permits waiting on
 * me), unread notifications, and the latest announcements.
 */
export function DashboardView(): ReactElement {
  const { data: me, isLoading } = useDashboardData();
  const t = useTranslations("app.dashboard");
  const canManageAttendance = useCan("manage_attendance");
  const canReviewLeave = useCan("review_leave_requests");
  const canIssueLeave = useCan("issue_leave_letters");
  const sessions = useTodaySessionsQuery(
    { date: todayInZone(me?.tenant.timezone) },
    canManageAttendance,
  );
  const lateQueue = useLateArrivalQueueQuery(canManageAttendance);
  const leaveQueue = useLeaveReviewQueueQuery(canReviewLeave || canIssueLeave);
  const unread = useUnreadCountQuery(Boolean(me));
  const classes = useClassesQuery(canManageAttendance);
  const subjects = useSubjectsQuery(canManageAttendance);
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);

  if (isLoading || !me) {
    return (
      <div className="flex flex-col gap-6 p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const todaySessions = sessions.data?.data ?? [];
  const pendingSessions = todaySessions.filter((s) => !s.submitted_at);
  const lateCount = lateQueue.data?.data.length ?? 0;
  const leaveCount = leaveQueue.data?.data.length ?? 0;
  const tasks = [
    ...(canManageAttendance && pendingSessions.length > 0
      ? [
          {
            key: "attendance",
            href: "/attendance",
            label: t("tasks.attendance", { count: pendingSessions.length }),
          },
        ]
      : []),
    ...(lateCount > 0
      ? [{ key: "late", href: "/late-arrivals", label: t("tasks.late", { count: lateCount }) }]
      : []),
    ...(leaveCount > 0
      ? [{ key: "leave", href: "/leave-requests", label: t("tasks.leave", { count: leaveCount }) }]
      : []),
    ...((unread.data?.count ?? 0) > 0
      ? [
          {
            key: "notifications",
            href: "/notifications",
            label: t("tasks.notifications", { count: unread.data?.count ?? 0 }),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("title")} title={t("greeting", { name: me.name })} />

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        {me.roles.map((role) => (
          <Badge key={role.id} variant={role.is_primary ? "accent" : "neutral"}>
            {role.name}
          </Badge>
        ))}
        <span>
          {t("academicYearLabel")}: {me.active_academic_year?.label ?? t("noAcademicYear")}
        </span>
      </div>

      <AdminDashboardPanel roles={me.roles} />

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title={t("tasksTitle")}>
          {tasks.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("tasksClear")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {tasks.map((task) => (
                <li key={task.key}>
                  <Link
                    href={task.href}
                    className="flex items-center justify-between py-2 text-[14px] text-fg hover:text-accent"
                  >
                    {task.label}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {canManageAttendance ? (
          <SectionCard
            title={t("todayTitle")}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/attendance">{t("openAttendance")}</Link>
              </Button>
            }
          >
            {sessions.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : todaySessions.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("todayEmpty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-[14px]">
                {todaySessions.map((s) => (
                  <li key={s.schedule_id} className="flex items-center justify-between py-2">
                    <span>
                      {classMap.get(s.class_id)?.name ?? "-"}{" "}
                      <span className="text-fg-muted">
                        {subjectMap.get(s.subject_id)?.name ?? ""}
                      </span>
                    </span>
                    <Badge variant={s.submitted_at ? "accent" : "neutral"}>
                      {s.submitted_at ? t("submitted") : t("pending")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        ) : (
          <SectionCard
            title={t("notificationsTitle")}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/notifications">{t("openNotifications")}</Link>
              </Button>
            }
          >
            <p className="flex items-center gap-2 text-[14px] text-fg">
              <Bell className="size-4 text-fg-muted" aria-hidden="true" />
              {t("unread", { count: unread.data?.count ?? 0 })}
            </p>
          </SectionCard>
        )}
      </div>

      <SectionCard
        title={t("announcementsTitle")}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/announcements">{t("openAnnouncements")}</Link>
          </Button>
        }
      >
        <AnnouncementFeed limit={3} />
      </SectionCard>

      <div className="flex items-center gap-2 text-[13px] text-fg-muted">
        <domainIcons.announcement className="size-4" aria-hidden="true" />
        {t("footerHint")}
      </div>
    </div>
  );
}
