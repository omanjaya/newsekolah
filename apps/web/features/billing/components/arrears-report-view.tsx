"use client";

import {
  DataTable,
  EmptyState,
  SegmentedControl,
  SkeletonCards,
  Stat,
  StatGrid,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, School, UsersRound, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useClassesQuery, useLookup } from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { type ArrearsClassLine, type ArrearsStudentLine, useArrearsReportQuery } from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

/** The arrears report carries no currency; every bill in the module is in rupiah today. */
const ARREARS_CURRENCY = "IDR";

const VIEWS = ["students", "classes"] as const;
type ArrearsView = (typeof VIEWS)[number];

/**
 * The finance office's arrears report: what the school is still owed this
 * year, by how many students, and where it is concentrated, then the same
 * money per student (a row opens that student at the payment desk) or per
 * class. Derived server-side from `domain.ArrearsByStudent`/`ArrearsByClass`.
 */
export function ArrearsReportView(): ReactElement {
  const t = useTranslations("app.billing.arrears");
  const router = useRouter();
  const { money } = useBillingFormat();
  const { data, isLoading, isError, error, refetch, isRefetching } = useArrearsReportQuery();
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);
  const [view, setView] = useUrlState<ArrearsView>("arrears_view", VIEWS, "students");

  const byStudent = data?.by_student ?? [];
  const byClass = data?.by_class ?? [];
  const studentMap = useDirectoryNames(byStudent.map((item) => item.student_user_id));
  const className = (classId?: string) =>
    classId ? (classMap.get(classId)?.name ?? t("noClass")) : t("noClass");
  const total = byStudent.reduce((sum, line) => sum + line.outstanding_minor, 0);
  const largest = byClass.reduce<ArrearsClassLine | undefined>(
    (top, line) =>
      top === undefined || line.outstanding_minor > top.outstanding_minor ? line : top,
    undefined,
  );

  const studentColumns = useMemo<ColumnDef<ArrearsStudentLine>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
      },
      {
        id: "class",
        header: t("columns.class"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) =>
          row.original.class_id ? (classMap.get(row.original.class_id)?.name ?? "–") : "–",
      },
      {
        accessorKey: "bill_count",
        header: t("columns.billCount"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.bill_count}</span>,
      },
      {
        id: "outstanding",
        header: t("columns.outstanding"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {money(row.original.outstanding_minor, ARREARS_CURRENCY)}
          </span>
        ),
      },
    ],
    [t, money, studentMap, classMap],
  );

  const classColumns = useMemo<ColumnDef<ArrearsClassLine>[]>(
    () => [
      {
        id: "class",
        header: t("columns.class"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) =>
          row.original.class_id
            ? (classMap.get(row.original.class_id)?.name ?? t("noClass"))
            : t("noClass"),
      },
      {
        accessorKey: "student_count",
        header: t("columns.studentCount"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.student_count}</span>,
      },
      {
        id: "outstanding",
        header: t("columns.outstanding"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {money(row.original.outstanding_minor, ARREARS_CURRENCY)}
          </span>
        ),
      },
    ],
    [t, money, classMap],
  );

  if (isLoading) return <SkeletonCards count={3} className="grid-cols-1 sm:grid-cols-3" />;
  if (isError && !data) return <QueryError retry={() => refetch()} error={error} />;

  if (byStudent.length === 0) {
    return (
      <EmptyState
        icon={<CircleCheck />}
        tone="success"
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <>
      <StatGrid variant="strip" aria-label={t("summaryLabel")}>
        <Stat
          icon={<Wallet />}
          tone="red"
          label={t("total")}
          value={<span className="tabular-nums">{money(total, ARREARS_CURRENCY)}</span>}
        />
        <Stat icon={<UsersRound />} tone="amber" label={t("students")} value={byStudent.length} />
        {largest && (
          <Stat
            icon={<School />}
            tone="blue"
            label={t("largestClass")}
            value={className(largest.class_id)}
            hint={money(largest.outstanding_minor, ARREARS_CURRENCY)}
          />
        )}
      </StatGrid>
      <SegmentedControl<ArrearsView>
        aria-label={t("viewLabel")}
        value={view}
        onValueChange={setView}
        className="self-start"
        options={[
          { value: "students", label: t("byStudent"), count: byStudent.length },
          { value: "classes", label: t("byClass"), count: byClass.length },
        ]}
      />
      <div className="flex flex-col md:min-h-0 md:flex-1">
        {view === "students" ? (
          <DataTable
            stateKey="features/billing/components/arrears-report-view:2"
            mode="local"
            data={byStudent}
            columns={studentColumns}
            rowCount={byStudent.length}
            searchable={false}
            error={isError ? error : undefined}
            onRetry={() => void refetch()}
            retrying={isRefetching}
            getRowId={(item) => item.student_user_id}
            onRowActivate={(item) => {
              router.push(`/billing?tab=desk&student=${item.student_user_id}`);
            }}
            fillHeight
          />
        ) : (
          <DataTable
            stateKey="features/billing/components/arrears-report-view:1"
            mode="local"
            data={byClass}
            columns={classColumns}
            rowCount={byClass.length}
            searchable={false}
            error={isError ? error : undefined}
            onRetry={() => void refetch()}
            retrying={isRefetching}
            getRowId={(item) => item.class_id ?? "none"}
            fillHeight
          />
        )}
      </div>
    </>
  );
}
