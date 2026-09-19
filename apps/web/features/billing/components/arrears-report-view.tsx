"use client";

import { type Locale, formatCurrency } from "@newsekolah/i18n";
import { DataTable, EmptyState, Skeleton, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import { type ArrearsClassLine, type ArrearsStudentLine, useArrearsReportQuery } from "../api";

/**
 * The finance office's arrears report: every student who still owes
 * money this year, and the same totals rolled up per class, both
 * derived server-side from `domain.ArrearsByStudent`/`ArrearsByClass`.
 */
export function ArrearsReportView(): ReactElement {
  const t = useTranslations("app.billing.arrears");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useArrearsReportQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);

  const byStudent = data?.by_student ?? [];
  const byClass = data?.by_class ?? [];

  const studentColumns = useMemo<ColumnDef<ArrearsStudentLine>[]>(
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
        cell: ({ row }) =>
          row.original.class_id ? (classMap.get(row.original.class_id)?.name ?? "-") : "-",
      },
      { accessorKey: "bill_count", header: t("columns.billCount"), enableSorting: false },
      {
        id: "outstanding",
        header: t("columns.outstanding"),
        enableSorting: false,
        cell: ({ row }) => formatCurrency(row.original.outstanding_minor, "IDR", { locale }),
      },
    ],
    [t, locale, studentMap, classMap],
  );

  const classColumns = useMemo<ColumnDef<ArrearsClassLine>[]>(
    () => [
      {
        id: "class",
        header: t("columns.class"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.class_id
            ? (classMap.get(row.original.class_id)?.name ?? t("noClass"))
            : t("noClass"),
      },
      { accessorKey: "student_count", header: t("columns.studentCount"), enableSorting: false },
      {
        id: "outstanding",
        header: t("columns.outstanding"),
        enableSorting: false,
        cell: ({ row }) => formatCurrency(row.original.outstanding_minor, "IDR", { locale }),
      },
    ],
    [t, locale, classMap],
  );

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (byStudent.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.billing aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-[14px] font-medium text-fg">{t("byClass")}</h3>
        <DataTable
          stateKey="features/billing/components/arrears-report-view:1"
          mode="local"
          data={byClass}
          columns={classColumns}
          rowCount={byClass.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          isLoading={false}
          getRowId={(item) => item.class_id ?? "none"}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-[14px] font-medium text-fg">{t("byStudent")}</h3>
        <DataTable
          stateKey="features/billing/components/arrears-report-view:2"
          mode="local"
          data={byStudent}
          columns={studentColumns}
          rowCount={byStudent.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          isLoading={false}
          getRowId={(item) => item.student_user_id}
        />
      </div>
    </div>
  );
}
