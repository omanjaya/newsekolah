"use client";

import { EmptyState, SkeletonCards, Stat, StatGrid } from "@newsekolah/ui";
import { UserCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useLibraryMembersReportQuery } from "../reports-api";

import { ReportBreakdown } from "./report-breakdown";

/** Members counted by type and by class, plus the active and total split. */
export function ReportMembersTable(): ReactElement {
  const t = useTranslations("app.library.reports.members");
  const { data, isLoading, isError, error, refetch } = useLibraryMembersReportQuery();

  if (isLoading) return <SkeletonCards count={2} />;
  if (isError) return <QueryError retry={() => refetch()} error={error} />;
  if (!data || data.total === 0) {
    return <EmptyState icon={<Users aria-hidden="true" />} title={t("emptyTitle")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <StatGrid variant="strip" aria-label={t("summaryLabel")}>
        <Stat icon={<Users />} category="blue" value={data.total} label={t("total")} />
        <Stat icon={<UserCheck />} category="green" value={data.active} label={t("active")} />
      </StatGrid>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <ReportBreakdown
          title={t("columns.type")}
          rows={data.per_type.map((row) => ({ key: row.id, name: row.name, count: row.count }))}
        />
        <ReportBreakdown
          title={t("columns.class")}
          rows={data.per_class.map((row) => ({
            key: row.class_name,
            name: row.class_name,
            count: row.count,
          }))}
        />
      </div>
    </div>
  );
}
