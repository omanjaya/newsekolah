"use client";

import { Badge, EmptyState, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import { BarChart3, ListTodo } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useDashboardData } from "../api";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Role-aware placeholder per the build brief: every value here comes from
 * `/v1/me` (name, roles, active academic year). Attendance, permits, and
 * announcements modules are not built yet, so those sections show an
 * honest empty state instead of invented numbers (antislop R-17, R-38).
 */
export function DashboardView(): ReactElement {
  const { data: me, isLoading } = useDashboardData();
  const t = useTranslations("app.dashboard");

  if (isLoading || !me) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("title")} title={t("greeting", { name: me.name })} />

      <SectionCard title={t("rolesLabel")}>
        <div className="flex flex-wrap gap-2">
          {me.roles.map((role) => (
            <Badge key={role.id} variant={role.is_primary ? "accent" : "neutral"}>
              {role.name}
            </Badge>
          ))}
        </div>
        <p className="text-[13px] text-fg-muted">
          {t("academicYearLabel")}: {me.active_academic_year?.label ?? t("noAcademicYear")}
        </p>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title={t("tasksTitle")}>
          <EmptyState
            icon={<ListTodo aria-hidden="true" />}
            title={t("tasksEmptyTitle")}
            description={t("tasksEmptyBody")}
          />
        </SectionCard>

        <SectionCard title={t("announcementsTitle")}>
          <EmptyState
            icon={<domainIcons.announcement aria-hidden="true" />}
            title={t("announcementsEmptyTitle")}
            description={t("announcementsEmptyBody")}
          />
        </SectionCard>
      </div>

      <SectionCard title={t("summaryTitle")}>
        <EmptyState
          icon={<BarChart3 aria-hidden="true" />}
          title={t("summaryEmptyTitle")}
          description={t("summaryEmptyBody")}
        />
      </SectionCard>
    </div>
  );
}
