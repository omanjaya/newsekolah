"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Alert, DataTable, EmptyState, PageHeader, Skeleton } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import { type StudentRisk, useAtRiskStudentsQuery } from "../api";

import { RiskLevelBadge } from "./risk-level-badge";

/**
 * The early-warning list: who to check on, ranked by score. A homeroom
 * teacher's own class only, a counselor or school leadership sees every
 * class -- decided server-side (analytics service.resolveScope), not by
 * anything this screen chooses.
 */
export function AtRiskStudentsView(): ReactElement {
  const t = useTranslations("app.analytics.list");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, error } = useAtRiskStudentsQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);

  const levelLabel = useTranslations("app.analytics.level");

  const rows = useMemo(() => {
    const items = data?.data ?? [];
    return [...items].sort((a, b) => b.score - a.score);
  }, [data]);

  const columns = useMemo<ColumnDef<StudentRisk>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
      },
      {
        id: "class",
        header: t("columns.class"),
        enableSorting: false,
        cell: ({ row }) => classMap.get(row.original.class_id)?.name ?? "-",
      },
      {
        id: "level",
        header: t("columns.level"),
        enableSorting: false,
        cell: ({ row }) => (
          <RiskLevelBadge level={row.original.level} label={levelLabel(row.original.level)} />
        ),
      },
      { accessorKey: "score", header: t("columns.score"), enableSorting: false },
      {
        id: "computedAt",
        header: t("columns.computedAt"),
        enableSorting: false,
        cell: ({ row }) => formatDateTime(row.original.computed_at, { locale }),
      },
    ],
    [t, locale, studentMap, classMap, levelLabel],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    const message =
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
    return (
      <div className="p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Alert variant="warning" title={message} className="mt-4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>
      <DataTable
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        getRowId={(item) => item.student_user_id}
        onRowActivate={(item) => {
          router.push(`/analytics/${item.student_user_id}`);
        }}
        emptyState={
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
    </div>
  );
}
