"use client";

import type { components } from "@newsekolah/api-client";
import { Badge, Skeleton } from "@newsekolah/ui";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useAdminDashboardQuery } from "../api";

import { LoginActivityChart } from "./login-activity-chart";
import { SectionCard } from "./section-card";

type Role = components["schemas"]["Role"];
const PROFILE_KINDS = ["student", "teacher", "staff"] as const;
const PENDING_LINKS = [
  { key: "leave_request", href: "/leave-requests" },
  { key: "exit_permit", href: "/exit-permits" },
  { key: "late_arrival", href: "/late-arrivals" },
] as const;

/** Sections share the same cached request; access follows the endpoint's admin restriction. */
export function AdminDashboardPanel({
  roles,
  section,
}: {
  roles: Role[];
  section: "summary" | "queue" | "activity";
}): ReactElement | null {
  const t = useTranslations("app.dashboard.admin");
  const format = useFormatter();
  const isAdmin = roles.some(
    (role) => role.slug === "admin" || role.slug === "super_admin" || role.slug === "principal",
  );
  const { data, isLoading, isError, refetch } = useAdminDashboardQuery(isAdmin);
  if (!isAdmin) return null;

  const title = t(
    section === "summary"
      ? "activeUsersTitle"
      : section === "queue"
        ? "pendingTitle"
        : "loginHistogramTitle",
  );
  if (isError)
    return (
      <SectionCard title={title}>
        <QueryError retry={refetch} />
      </SectionCard>
    );
  if (isLoading || !data)
    return (
      <SectionCard title={title}>
        <Skeleton className="h-24 w-full" aria-busy="true" />
      </SectionCard>
    );

  if (section === "summary") {
    return (
      <section
        aria-label={t("activeUsersTitle")}
        className="overflow-hidden rounded-sm border border-border bg-surface"
      >
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {PROFILE_KINDS.map((kind) => (
            <div
              key={kind}
              className="flex flex-col gap-1 border-border p-3 sm:p-4 odd:border-r max-lg:nth-[-n+2]:border-b lg:border-r lg:last:border-r-0"
            >
              <dt className="text-[13px] text-fg-muted">{t(`kinds.${kind}`)}</dt>
              <dd className="text-[24px] sm:text-[32px] leading-tight font-medium tracking-tight tabular-nums text-fg">
                {format.number(data.active_users[kind] ?? 0)}
              </dd>
              <dd className="text-[12px] text-fg-muted">{t("activeAccountLabel")}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  if (section === "queue") {
    return (
      <SectionCard title={title} note={t("pendingNote")}>
        <table className="w-full text-[13px]">
          <thead className="border-b border-border text-left text-[12px] text-fg-muted">
            <tr>
              <th scope="col" className="pb-2 font-normal">
                {t("queueType")}
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                {t("queueCount")}
              </th>
              <th scope="col">
                <span className="sr-only">{t("openQueue")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PENDING_LINKS.map(({ key, href }) => (
              <tr key={key}>
                <th scope="row" className="text-left font-normal text-fg">
                  {t(`pendingLabels.${key}`)}
                </th>
                <td className="text-right tabular-nums">
                  <Badge variant={data.pending[key] > 0 ? "accent" : "neutral"}>
                    {format.number(data.pending[key])}
                  </Badge>
                </td>
                <td className="w-11 text-right">
                  <Link
                    href={href}
                    aria-label={`${t("openQueue")}: ${t(`pendingLabels.${key}`)}`}
                    className="inline-flex size-11 items-center justify-center rounded-xs text-fg-muted hover:bg-bg hover:text-fg"
                  >
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    );
  }

  const onlineRoles = Object.entries(data.online_by_role)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);
  return (
    <SectionCard title={title} note={t("loginHistogramNote")}>
      <LoginActivityChart values={data.login_histogram} />
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[12px] text-fg-muted">
        <span className="font-medium text-fg">{t("onlineTitle")}</span>
        {onlineRoles.length === 0 ? (
          <span>{t("onlineEmpty")}</span>
        ) : (
          onlineRoles.map(([role, count]) => (
            <span key={role}>
              <span className="tabular-nums text-fg">{format.number(count)}</span>{" "}
              {t.has(`roleNames.${role}`) ? t(`roleNames.${role}`) : role}
            </span>
          ))
        )}
      </div>
    </SectionCard>
  );
}
