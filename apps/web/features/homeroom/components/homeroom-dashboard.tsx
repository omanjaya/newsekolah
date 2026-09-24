"use client";

import type { components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Badge, Skeleton, StatusBadge } from "@newsekolah/ui";
import { MessageCircle, Phone, ShieldAlert, UserCheck2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { statusToken } from "../../attendance/lib/status-tokens";
import { telHref, whatsAppHref } from "../lib/guardian-contact";

type Entry = components["schemas"]["AttendanceHomeroomEntry"];
type LeaveRequestSummary = components["schemas"]["LeaveRequestSummary"];

/**
 * The homeroom teacher's three at-a-glance cards, above the full
 * searchable roster: who needs attention today (absent or incomplete
 * attendance), leave requests waiting on this teacher's approval, and any
 * discipline record for the class. Split out of `homeroom-view.tsx` to
 * keep that file under the line budget.
 */
export function HomeroomDashboard({
  attentionRows,
  disciplineRows,
  pendingLeave,
  dashboardLoading,
  leaveLoading,
  timeZone,
}: {
  attentionRows: Entry[];
  disciplineRows: Entry[];
  pendingLeave: LeaveRequestSummary[];
  dashboardLoading: boolean;
  leaveLoading: boolean;
  timeZone?: string;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const locale = useLocale() as Locale;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <DashboardCard
        icon={<UserCheck2 className="size-4" aria-hidden="true" />}
        title={t("attentionTitle")}
      >
        {dashboardLoading ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : attentionRows.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("attentionEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {attentionRows.map((row) => {
              const token = statusToken(row.status_code);
              return (
                <li
                  key={row.student_user_id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] text-fg">
                      {formatDisplayName(row.name)}
                    </span>
                    {row.nis && <span className="text-[12px] text-fg-muted">{row.nis}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {token ? (
                      <StatusBadge status={token} label={t(`codes.${row.status_code}`)} />
                    ) : (
                      <span className="text-fg-muted">{t(`codes.${row.status_code}`)}</span>
                    )}
                    {row.guardian_phone && (
                      <>
                        <a
                          href={telHref(row.guardian_phone)}
                          aria-label={t("contactCall", { name: formatDisplayName(row.name) })}
                          className="inline-flex size-11 items-center justify-center rounded-sm border border-border text-fg transition-colors hover:bg-bg md:size-8"
                        >
                          <Phone className="size-4" aria-hidden="true" />
                        </a>
                        <a
                          href={whatsAppHref(row.guardian_phone)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t("contactWhatsapp", { name: formatDisplayName(row.name) })}
                          className="inline-flex size-11 items-center justify-center rounded-sm border border-border text-fg transition-colors hover:bg-bg md:size-8"
                        >
                          <MessageCircle className="size-4" aria-hidden="true" />
                        </a>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DashboardCard>

      <DashboardCard
        icon={<UsersRound className="size-4" aria-hidden="true" />}
        title={t("pendingLeaveTitle")}
      >
        {leaveLoading ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : pendingLeave.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("pendingLeaveEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {pendingLeave.map((item) => (
              <li key={item.instance_id}>
                <Link
                  href={`/leave-requests/${item.instance_id}`}
                  className="flex items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] text-fg">
                      {formatDisplayName(item.student_name)}
                    </span>
                    <span className="text-[12px] text-fg-muted">
                      {formatDate(item.starts_on, { locale, timeZone })} -{" "}
                      {formatDate(item.ends_on, { locale, timeZone })}
                    </span>
                  </div>
                  <Badge variant="accent">{t("pendingLeaveReview")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

      <DashboardCard
        icon={<ShieldAlert className="size-4" aria-hidden="true" />}
        title={t("disciplineTitle")}
      >
        {dashboardLoading ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : disciplineRows.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("disciplineEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {disciplineRows.map((row) => (
              <li key={row.student_user_id}>
                <Link
                  href={`/discipline/students/${row.student_user_id}`}
                  className="flex items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <span className="truncate text-[13px] text-fg">
                    {formatDisplayName(row.name)}
                  </span>
                  <span className="shrink-0 text-[12px] text-fg-muted">
                    {t("violationSummary", {
                      count: row.violation_count ?? 0,
                      points: row.violation_points ?? 0,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>
    </div>
  );
}

function DashboardCard({
  icon,
  title,
  children,
}: {
  icon: ReactElement;
  title: string;
  children: ReactElement;
}): ReactElement {
  return (
    <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[14px] font-medium text-fg">{title}</h2>
      </div>
      {children}
    </section>
  );
}
