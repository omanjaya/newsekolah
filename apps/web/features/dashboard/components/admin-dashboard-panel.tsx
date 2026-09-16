"use client";

import type { components } from "@newsekolah/api-client";
import { Badge, Skeleton } from "@newsekolah/ui";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useAdminDashboardQuery } from "../api";

import { SectionCard } from "./dashboard-view";

type Role = components["schemas"]["Role"];

const PROFILE_KINDS = ["teacher", "staff", "student", "parent"] as const;

const PENDING_LINKS = [
  { key: "leave_request", href: "/leave-requests" },
  { key: "exit_permit", href: "/exit-permits" },
  { key: "late_arrival", href: "/late-arrivals" },
] as const;

/**
 * Operational snapshot for admin/super_admin (docs/07-ui-ux.md's "beranda
 * per peran"): active users per profile kind, the three pending workflow
 * queues, and a 7-day login histogram, all from GET
 * /v1/analytics/admin-dashboard. Hidden entirely for any other role, since
 * the endpoint itself 403s for everyone else regardless of who holds
 * view_dashboard.
 *
 * online_by_role counts live sockets, not sessions: it reflects who has a
 * GET /ws/me connection open right now, so a role nobody is connected
 * under is absent from the map rather than reported as zero.
 */
export function AdminDashboardPanel({ roles }: { roles: Role[] }): ReactElement | null {
  const t = useTranslations("app.dashboard.admin");
  const isAdmin = roles.some((r) => r.slug === "admin" || r.slug === "super_admin");
  const { data, isLoading, isError } = useAdminDashboardQuery(isAdmin);

  if (!isAdmin) return null;

  const onlineRoles = Object.entries(data?.online_by_role ?? {})
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard title={t("activeUsersTitle")}>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <p className="text-[13px] text-fg-muted">{t("loadError")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PROFILE_KINDS.map((kind) => (
              <div key={kind} className="flex flex-col">
                <dt className="text-[12px] text-fg-muted">{t(`kinds.${kind}`)}</dt>
                <dd className="text-[20px] font-medium tabular-nums text-fg">
                  {data?.active_users[kind] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </SectionCard>

      <SectionCard title={t("pendingTitle")}>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <p className="text-[13px] text-fg-muted">{t("loadError")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {PENDING_LINKS.map(({ key, href }) => {
              const count = data?.pending[key] ?? 0;
              return (
                <li key={key}>
                  <Link
                    href={href}
                    className="flex items-center justify-between gap-2 py-2 text-[14px] text-fg hover:text-accent"
                  >
                    <span className="flex items-center gap-2">
                      <ClipboardList className="size-4 text-fg-muted" aria-hidden="true" />
                      {t(`pendingLabels.${key}`)}
                    </span>
                    <Badge variant={count > 0 ? "accent" : "neutral"}>{count}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t("onlineTitle")}>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <p className="text-[13px] text-fg-muted">{t("loadError")}</p>
        ) : onlineRoles.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("onlineEmpty")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {onlineRoles.map(([role, count]) => (
              <div key={role} className="flex flex-col">
                <dt className="text-[12px] text-fg-muted">{role}</dt>
                <dd className="text-[20px] font-medium tabular-nums text-fg">{count}</dd>
              </div>
            ))}
          </dl>
        )}
      </SectionCard>

      <SectionCard title={t("loginHistogramTitle")}>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <p className="text-[13px] text-fg-muted">{t("loadError")}</p>
        ) : (
          <LoginHistogram
            values={data?.login_histogram ?? []}
            chartLabel={t("loginHistogramTitle")}
            emptyLabel={t("histogramEmpty")}
          />
        )}
      </SectionCard>
    </div>
  );
}

function LoginHistogram({
  values,
  chartLabel,
  emptyLabel,
}: {
  values: number[];
  chartLabel: string;
  emptyLabel: string;
}): ReactElement {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total === 0) {
    return <p className="text-[13px] text-fg-muted">{emptyLabel}</p>;
  }
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={chartLabel}>
      {values.map((value, hour) => (
        <div
          key={hour}
          title={`${String(hour).padStart(2, "0")}:00: ${value}`}
          className="flex-1 rounded-t-xs bg-accent/70"
          style={{ height: `${Math.max((value / max) * 100, value > 0 ? 6 : 2)}%` }}
        />
      ))}
    </div>
  );
}
