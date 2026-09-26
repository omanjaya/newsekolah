"use client";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@newsekolah/ui";
import { FileClock, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { todayInZone, useHomeroomAttendanceQuery } from "../../../attendance/api";
import { useLeaveReviewQueueQuery, type LeaveRequestSummary } from "../../../permits/api";
import { EMPTY_BLOCK, HERO_PRIORITY, type Me, type PersonaBlock } from "../types";

/** Large enough to cover a whole homeroom class in one page, matching
 * `homeroom-view.tsx`'s own dashboard sections. */
const DASHBOARD_LIMIT = 200;

/**
 * A homeroom teacher's binaan class: the leave-request queue scoped to
 * their class, and today's status counts from `useHomeroomAttendanceQuery`.
 * `me.duties` carries the class as a `homeroom` duty (`scope_id`,
 * `scope_label`) rather than a dedicated homeroom feature module.
 */
export function useHomeroomBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardTeaching.homeroom");
  const duty = me.duties?.find((d) => d.slug === "homeroom");
  const classId = duty?.scope_id ?? "";
  const className = duty?.scope_label ?? "";

  const attendance = useHomeroomAttendanceQuery(
    { date: todayInZone(me.tenant.timezone), limit: DASHBOARD_LIMIT, offset: 0 },
    active,
  );
  const leaveQueue = useLeaveReviewQueueQuery(active);

  if (!active) return EMPTY_BLOCK;

  const pending = (leaveQueue.data?.data ?? []).filter((item) => item.class_id === classId);
  const block: PersonaBlock = { tiles: [], left: [], right: [] };

  if (leaveQueue.isSuccess) {
    block.tiles.push({
      key: "homeroom.leave",
      priority: 85,
      label: t("tiles.leaveLabel"),
      value: String(pending.length),
      href: "/leave-requests",
      icon: FileClock,
      tone: "amber",
    });
    if (pending.length > 0) {
      block.hero = {
        key: "homeroom.leave",
        priority: HERO_PRIORITY.leaveQueue,
        eyebrow: className ? t("hero.eyebrow", { className }) : t("hero.eyebrowFallback"),
        title: t("hero.title", { count: pending.length }),
        action: { label: t("hero.action"), href: "/leave-requests" },
      };
    }
  }

  const counts = attendance.data?.status_counts ?? {};
  const total = attendance.data?.total ?? 0;
  if (attendance.isSuccess && total > 0) {
    const rate = Math.round(((counts.H ?? 0) / total) * 100);
    block.tiles.push({
      key: "homeroom.rate",
      priority: 70,
      label: t("tiles.rateLabel"),
      value: `${rate}%`,
      hint: className ? t("tiles.rateHint", { className }) : undefined,
      icon: Users,
      tone: "blue",
    });
  }

  block.left = [
    {
      key: "homeroom.class",
      node: (
        <HomeroomClassCard
          className={className}
          pending={pending}
          pendingLoading={leaveQueue.isLoading}
          pendingError={leaveQueue.isError}
          onRetryPending={() => void leaveQueue.refetch()}
          counts={counts}
          countsLoading={attendance.isLoading}
          countsError={attendance.isError}
          onRetryCounts={() => void attendance.refetch()}
          t={t}
        />
      ),
    },
  ];

  return block;
}

function HomeroomClassCard({
  className,
  pending,
  pendingLoading,
  pendingError,
  onRetryPending,
  counts,
  countsLoading,
  countsError,
  onRetryCounts,
  t,
}: {
  className: string;
  pending: LeaveRequestSummary[];
  pendingLoading: boolean;
  pendingError: boolean;
  onRetryPending: () => void;
  counts: Record<string, number>;
  countsLoading: boolean;
  countsError: boolean;
  onRetryCounts: () => void;
  t: ReturnType<typeof useTranslations>;
}): ReactElement {
  // Reuses the existing leave-category and homeroom status-code catalogs
  // (app.permits.leave.categories, app.homeroom.codes) rather than
  // duplicating those labels in this new catalog.
  const categoryT = useTranslations("app.permits.leave");
  const statusT = useTranslations("app.homeroom");
  const codes = Object.entries(counts).filter(([, count]) => count > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>
          {className ? t("card.title", { className }) : t("card.titleFallback")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/leave-requests">{t("card.action")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div>
          {pendingLoading ? (
            <Skeleton className="h-16 w-full" aria-busy="true" />
          ) : pendingError ? (
            <QueryError retry={onRetryPending} />
          ) : pending.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("card.empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {pending.slice(0, 5).map((item) => (
                <li key={item.instance_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-fg">{item.student_name}</span>
                    <span className="block truncate text-[12px] text-fg-muted">
                      {categoryT(`categories.${item.category}`)}
                    </span>
                  </span>
                  <Link
                    href="/leave-requests"
                    className="shrink-0 text-[13px] text-accent underline underline-offset-2"
                  >
                    {t("card.review")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          {countsLoading ? (
            <Skeleton className="h-8 w-full" aria-busy="true" />
          ) : countsError ? (
            <QueryError retry={onRetryCounts} />
          ) : codes.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("card.noStatus")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {codes.map(([code, count]) => (
                <li key={code}>
                  <Badge variant="neutral">
                    {statusT(`codes.${code}`)}: {count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
