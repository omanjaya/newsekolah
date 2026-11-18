"use client";

import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  Skeleton,
  SkeletonList,
  StatusBadge,
  TextLink,
  type StatusName,
} from "@newsekolah/ui";
import { CheckCheck, FileClock, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
import { todayInZone, useHomeroomAttendanceQuery } from "../../../attendance/api";
import { useLeaveReviewQueueQuery, type LeaveRequestSummary } from "../../../permits/api";
import { EMPTY_BLOCK, HERO_PRIORITY, type Me, type PersonaBlock } from "../types";

/** Large enough to cover a whole homeroom class in one page, matching
 * `homeroom-view.tsx`'s own dashboard sections. */
const DASHBOARD_LIMIT = 200;

const LEAVE_HREF = "/leave-requests";

/** Homeroom status codes that are attendance statuses, in roster order. */
const CODE_STATUS: Record<string, StatusName> = {
  H: "present",
  S: "sick",
  I: "excused",
  D: "dispensation",
  A: "absent",
};

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
  const permitsOn = isModuleEnabled(me, "permits");
  const leaveQueue = useLeaveReviewQueueQuery(active && permitsOn);

  if (!active) return EMPTY_BLOCK;

  const pending = (leaveQueue.data?.data ?? []).filter((item) => item.class_id === classId);
  const block: PersonaBlock = {
    tiles: [],
    main: [],
    side: [],
    pending: (permitsOn && leaveQueue.isLoading) || attendance.isLoading,
  };

  if (leaveQueue.isSuccess) {
    block.tiles.push({
      key: "homeroom.leave",
      priority: 85,
      label: t("tiles.leaveLabel"),
      value: String(pending.length),
      href: LEAVE_HREF,
      icon: FileClock,
      tone: "amber",
    });
    if (pending.length > 0) {
      block.hero = {
        key: "homeroom.leave",
        priority: HERO_PRIORITY.leaveQueue,
        eyebrow: className ? t("hero.eyebrow", { className }) : t("hero.eyebrowFallback"),
        title: t("hero.title", { count: pending.length }),
        meta: t("hero.meta"),
        action: { label: t("hero.action"), href: LEAVE_HREF },
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
      href: "/homeroom",
    });
  }

  block.main = [
    {
      key: "homeroom.class",
      node: (
        <HomeroomClassCard
          className={className}
          showLeave={permitsOn}
          pending={pending}
          pendingLoading={leaveQueue.isLoading}
          pendingError={leaveQueue.isError ? leaveQueue.error : null}
          onRetryPending={() => void leaveQueue.refetch()}
          counts={counts}
          countsLoading={attendance.isLoading}
          countsError={attendance.isError ? attendance.error : null}
          onRetryCounts={() => void attendance.refetch()}
        />
      ),
    },
  ];

  return block;
}

function HomeroomClassCard({
  className,
  showLeave,
  pending,
  pendingLoading,
  pendingError,
  onRetryPending,
  counts,
  countsLoading,
  countsError,
  onRetryCounts,
}: {
  className: string;
  /** False when the school switched permits off: the leave section and its link go away. */
  showLeave: boolean;
  pending: LeaveRequestSummary[];
  pendingLoading: boolean;
  pendingError: unknown;
  onRetryPending: () => void;
  counts: Record<string, number>;
  countsLoading: boolean;
  countsError: unknown;
  onRetryCounts: () => void;
}): ReactElement {
  const t = useTranslations("app.dashboardTeaching.homeroom");
  // Reuses the existing leave-category and homeroom status-code catalogs
  // (app.permits.leave.categories, app.homeroom.codes) rather than
  // duplicating those labels in this new catalog.
  const categoryT = useTranslations("app.permits.leave");
  const statusT = useTranslations("app.homeroom");
  const codes = Object.entries(counts).filter(([, count]) => count > 0);

  return (
    <Card>
      <CardHeader
        action={showLeave ? <TextLink href={LEAVE_HREF}>{t("card.action")}</TextLink> : undefined}
      >
        <CardTitle as="h2">
          {className ? t("card.title", { className }) : t("card.titleFallback")}
        </CardTitle>
        <CardDescription>
          {className ? t("card.statusTitle", { className }) : t("card.statusTitleFallback")}
        </CardDescription>
      </CardHeader>
      <div className="px-5 pb-4">
        {countsLoading ? (
          <Skeleton className="h-6 w-2/3" aria-busy="true" />
        ) : countsError ? (
          <QueryError retry={onRetryCounts} error={countsError} />
        ) : codes.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("card.noStatus")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label={t("card.statusLabel")}>
            {codes.map(([code, count]) => {
              const status = CODE_STATUS[code];
              const label = `${statusT(`codes.${code}`)} ${count}`;
              return (
                <li key={code}>
                  {status ? (
                    <StatusBadge status={status} label={label} />
                  ) : (
                    <Badge tone="warning">{label}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {showLeave &&
        (pendingLoading ? (
          <div className="px-5 pb-5">
            <SkeletonList rows={2} framed={false} />
          </div>
        ) : pendingError ? (
          <div className="px-5 pb-5">
            <QueryError retry={onRetryPending} error={pendingError} />
          </div>
        ) : pending.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState variant="compact" icon={<CheckCheck />} title={t("card.empty")} />
          </div>
        ) : (
          <List className="border-t border-line">
            {pending.slice(0, 5).map((item) => (
              <ListRow
                key={item.instance_id}
                href={`${LEAVE_HREF}/${item.instance_id}`}
                title={item.student_name}
                meta={categoryT(`categories.${item.category}`)}
              />
            ))}
          </List>
        ))}
    </Card>
  );
}
