"use client";

import type { components } from "@newsekolah/api-client";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  Skeleton,
  SkeletonList,
  TextLink,
} from "@newsekolah/ui";
import { ClipboardCheck, Inbox, ShieldCheck, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
import { navAccessFromMe } from "../../../../lib/navigation-access";
import { canOpenPath } from "../../../../lib/navigation-permissions";
import { useAtRiskStudentsQuery } from "../../../analytics/api";
import { RiskLevelBadge } from "../../../analytics/components/risk-level-badge";
import {
  type ClassRef,
  type DirectoryUser,
  useClassesQuery,
  useLookup,
} from "../../../reference/api";
import { useDirectoryNames } from "../../../reference/directory-names";
import { studentProfileHref } from "../../../students/href";
import { useAdminDashboardQuery } from "../../api";
import {
  EMPTY_BLOCK,
  HERO_PRIORITY,
  type BlockSlot,
  type HeroCandidate,
  type Me,
  type PersonaBlock,
  type TileSpec,
} from "../types";

import { LoginActivityChart } from "./login-activity-chart";

type AdminDashboard = components["schemas"]["AdminDashboard"];
type StudentRisk = components["schemas"]["StudentRisk"];

const MONITOR_HREF = "/monitor";
const INBOX_HREF = "/inbox";
const REPORTS_HREF = "/reports";
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
 * The hero carries attendance taken in the classes in session right now,
 * so no card repeats it; system activity sits in the side column.
 */
export function useLeadershipBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardSchool.leadership");
  const dashboard = useAdminDashboardQuery(active);
  // GET /v1/analytics/at-risk-students requires view_early_warning, which
  // the admin/principal seed accounts do not hold (it returns 403 for
  // them): the query only runs, and the card only renders, for a caller who
  // actually has it.
  const canViewAtRisk = me.permissions.includes("view_early_warning");
  // The pending queues (leave, exit permits, late arrivals) are permits data.
  const permitsOn = isModuleEnabled(me, "permits");
  const atRisk = useAtRiskStudentsQuery(active && canViewAtRisk);
  // Only the top rows are shown, so only their names are looked up.
  const topAtRisk = (atRisk.data?.data ?? [])
    .filter((row) => row.level !== "none")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const studentMap = useDirectoryNames(
    topAtRisk.map((row) => row.student_user_id),
    active,
  );
  const classes = useClassesQuery(active && canViewAtRisk);
  const classMap = useLookup(classes.data?.data);

  if (!active) return EMPTY_BLOCK;

  const data = dashboard.data;
  const ready = !dashboard.isLoading && !dashboard.isError && Boolean(data);
  const attendanceToday = data?.attendance_today;
  const pendingTotal = data
    ? data.pending.leave_request + data.pending.exit_permit + data.pending.late_arrival
    : 0;

  let hero: HeroCandidate | undefined;
  if (ready && data) {
    if (attendanceToday && attendanceToday.total > 0) {
      const waiting = attendanceToday.total - attendanceToday.submitted;
      // The title and the meter carry the one figure; no meta sentence
      // restates it, and the stat row leaves out its own copy of it.
      hero = {
        key: "school.summary",
        priority: HERO_PRIORITY.schoolSummary,
        tone: waiting > 0 ? "accent-soft" : "neutral",
        eyebrow: t("hero.eyebrow"),
        title: t("hero.title", {
          submitted: attendanceToday.submitted,
          total: attendanceToday.total,
        }),
        coversTiles: ["school.sessions"],
        progress: {
          value: attendanceToday.submitted,
          max: attendanceToday.total,
          label: t("hero.progressLabel"),
          valueLabel: `${attendanceToday.submitted}/${attendanceToday.total}`,
        },
        // A leader without the monitor permission gets the reports instead
        // (the home guards every hero link against the reader's access).
        action: { label: t("hero.action"), href: MONITOR_HREF },
        secondaryAction: { label: t("hero.reportsAction"), href: REPORTS_HREF },
      };
    } else if (permitsOn && pendingTotal > 0) {
      hero = {
        key: "school.queue",
        priority: HERO_PRIORITY.schoolSummary,
        eyebrow: t("hero.queueEyebrow"),
        title: t("hero.queueTitle", { count: pendingTotal }),
        meta: t("hero.queueMeta"),
        action: { label: t("hero.queueAction"), href: INBOX_HREF },
        secondaryAction: { label: t("hero.reportsAction"), href: REPORTS_HREF },
      };
    } else {
      hero = {
        key: "school.idle",
        priority: HERO_PRIORITY.inboxIdle,
        tone: "neutral",
        eyebrow: t("hero.eyebrow"),
        title: t("hero.idleTitle"),
        meta: t("hero.idleMeta"),
        action: { label: t("hero.reportsAction"), href: REPORTS_HREF },
        secondaryAction: { label: t("hero.action"), href: MONITOR_HREF },
      };
    }
  }

  const tiles: TileSpec[] = [];
  if (ready && data) {
    if (attendanceToday && attendanceToday.total > 0) {
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
    if (permitsOn) {
      tiles.push({
        key: "school.pending",
        priority: 75,
        label: t("tiles.pending"),
        value: String(pendingTotal),
        icon: Inbox,
        tone: "amber",
        href: INBOX_HREF,
      });
    }
    tiles.push({
      key: "school.users",
      priority: 50,
      label: t("tiles.users"),
      value: String(Object.values(data.active_users).reduce((sum, count) => sum + count, 0)),
      icon: Users,
      tone: "blue",
    });
    // Who is online is named, role by role, in the activity card.
  }

  // A queue row links only to a screen the reader may open; the principal
  // holds none of the permit permissions, so those rows stay plain.
  const access = navAccessFromMe(me);
  const openableQueues = PENDING_LINKS.filter(({ href }) => canOpenPath(href, access)).map(
    ({ key }) => key,
  );

  const main: BlockSlot[] = permitsOn
    ? [
        {
          key: "school.queue",
          node: (
            <SchoolQueueCard
              key="school.queue"
              isLoading={dashboard.isLoading}
              error={dashboard.isError ? dashboard.error : null}
              refetch={dashboard.refetch}
              data={data}
              linkedQueues={openableQueues}
              inboxHref={canOpenPath(INBOX_HREF, access) ? INBOX_HREF : undefined}
            />
          ),
        },
      ]
    : [];

  const side: BlockSlot[] = [
    ...(canViewAtRisk
      ? [
          {
            key: "school.atRisk",
            node: (
              <AtRiskCard
                key="school.atRisk"
                isLoading={atRisk.isLoading}
                error={atRisk.isError ? atRisk.error : null}
                refetch={atRisk.refetch}
                rows={topAtRisk}
                studentMap={studentMap}
                classMap={classMap}
              />
            ),
          },
        ]
      : []),
    {
      key: "school.activity",
      node: (
        <SchoolActivityCard
          key="school.activity"
          isLoading={dashboard.isLoading}
          error={dashboard.isError ? dashboard.error : null}
          refetch={dashboard.refetch}
          data={data}
        />
      ),
    },
  ];

  return { hero, tiles, main, side, pending: dashboard.isLoading };
}

function SchoolQueueCard({
  isLoading,
  error,
  refetch,
  data,
  linkedQueues,
  inboxHref,
}: {
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
  data: AdminDashboard | undefined;
  linkedQueues: readonly (typeof PENDING_LINKS)[number]["key"][];
  inboxHref: string | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.leadership.queue");
  const format = useFormatter();
  const allClear = data !== undefined && PENDING_LINKS.every(({ key }) => data.pending[key] === 0);
  return (
    <Card>
      <CardHeader
        action={inboxHref ? <TextLink href={inboxHref}>{t("openInbox")}</TextLink> : undefined}
      >
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      {error ? (
        <div className="px-5 pb-5">
          <QueryError retry={refetch} error={error} />
        </div>
      ) : isLoading || !data ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={3} leading={false} framed={false} />
        </div>
      ) : allClear ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<ShieldCheck />} title={t("allClear")} />
        </div>
      ) : (
        <List>
          {PENDING_LINKS.map(({ key, href }) => {
            const count = data.pending[key];
            return (
              <ListRow
                key={key}
                href={linkedQueues.includes(key) ? href : undefined}
                title={t(`labels.${key}`)}
                trailing={
                  <Badge tone={count > 0 ? "warning" : "neutral"} size="sm">
                    {format.number(count)}
                  </Badge>
                }
              />
            );
          })}
        </List>
      )}
    </Card>
  );
}

function SchoolActivityCard({
  isLoading,
  error,
  refetch,
  data,
}: {
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
  data: AdminDashboard | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.leadership.activity");
  const format = useFormatter();
  const onlineRoles = Object.entries(data?.online_by_role ?? {})
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <QueryError retry={refetch} error={error} />
        ) : isLoading || !data ? (
          <Skeleton className="h-28 w-full" aria-busy="true" />
        ) : (
          <>
            <LoginActivityChart values={data.login_histogram} />
            <div className="flex flex-col gap-1">
              <p className="text-label text-fg">{t("onlineTitle")}</p>
              <p className="text-body-sm text-fg-muted">
                {onlineRoles.length === 0
                  ? t("onlineEmpty")
                  : onlineRoles
                      .map(
                        ([role, count]) =>
                          `${format.number(count)} ${t.has(`roleNames.${role}`) ? t(`roleNames.${role}`) : role}`,
                      )
                      .join(" · ")}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AtRiskCard({
  isLoading,
  error,
  refetch,
  rows,
  studentMap,
  classMap,
}: {
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
  rows: StudentRisk[];
  studentMap: Map<string, DirectoryUser>;
  classMap: Map<string, ClassRef>;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.leadership.atRisk");
  const levelLabel = useTranslations("app.analytics.level");

  return (
    <Card>
      <CardHeader action={<TextLink href={ANALYTICS_HREF}>{t("viewAll")}</TextLink>}>
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      {error ? (
        <div className="px-5 pb-5">
          <QueryError retry={refetch} error={error} />
        </div>
      ) : isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={3} framed={false} />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<ShieldCheck />} title={t("empty")} />
        </div>
      ) : (
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.student_user_id}
              href={studentProfileHref(row.student_user_id)}
              title={studentMap.get(row.student_user_id)?.name ?? t("unknownStudent")}
              meta={classMap.get(row.class_id)?.name ?? "-"}
              trailing={<RiskLevelBadge level={row.level} label={levelLabel(row.level)} />}
            />
          ))}
        </List>
      )}
    </Card>
  );
}
