"use client";

import {
  DataTable,
  EmptyState,
  FilteredEmptyState,
  domainIcons,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useClassesQuery } from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { type Bill, type BillStatus, useBillsQuery } from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

import { BillDetailSheet } from "./bill-detail-sheet";
import { BillStatusBadge } from "./bill-status-badge";

const STATUS_VALUES: BillStatus[] = ["unpaid", "partial", "paid"];
const STATUS_FILTER_VALUES = ["", ...STATUS_VALUES] as const;
const PAGE_SIZE = 50;

/**
 * Every bill this year, filterable by month, status and class (all kept
 * in the URL), the cross-student view the payment desk does not give. A
 * row opens the bill's detail; amounts and what is left of them line up
 * on the right in tabular figures.
 */
export function BillsListView(): ReactElement {
  const t = useTranslations("app.billing.bills");
  const { me } = useSession();
  const { money, day, period: periodLabel } = useBillingFormat();
  const classes = useClassesQuery();

  const [period, setPeriod] = useDateFilter("period", "", true);
  const [status, setStatus] = useUrlState<(typeof STATUS_FILTER_VALUES)[number]>(
    "status",
    STATUS_FILTER_VALUES,
    "",
  );
  const [classId, setClassId] = useUrlState<string>("class_id", () => true, "");
  const paging = useOffsetPage(PAGE_SIZE);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useBillsQuery(
    { period, status, classId },
    { limit: paging.limit, offset: paging.offset },
  );
  const rows = data?.data ?? [];
  const studentMap = useDirectoryNames(rows.map((item) => item.student_user_id));

  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const filters: DataTableFilterDef[] = [
    {
      id: "period",
      label: t("columns.period"),
      type: "month",
      value: period,
      onChange: (value) => {
        setPeriod(value);
        paging.resetPage();
      },
      today: todayInZone(me?.tenant.timezone),
    },
    {
      id: "status",
      label: t("statusLabel"),
      value: status,
      onChange: (value) => {
        setStatus(value as (typeof STATUS_FILTER_VALUES)[number]);
        paging.resetPage();
      },
      options: STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
    },
    {
      id: "class",
      label: t("classLabel"),
      value: classId,
      onChange: (value) => {
        setClassId(value);
        paging.resetPage();
      },
      options: classOptions,
    },
  ];
  const filtered = period !== "" || status !== "" || classId !== "";

  const columns = useMemo<ColumnDef<Bill>[]>(
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
        accessorKey: "fee_type_name",
        header: t("columns.feeType"),
        enableSorting: false,
        meta: { card: "subtitle" },
      },
      {
        id: "period",
        header: t("columns.period"),
        enableSorting: false,
        cell: ({ row }) => periodLabel(row.original.period),
      },
      {
        id: "dueDate",
        header: t("columns.dueDate"),
        enableSorting: false,
        cell: ({ row }) => day(row.original.due_date),
      },
      {
        id: "amount",
        header: t("columns.amount"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {money(row.original.amount_minor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "remaining",
        header: t("columns.remaining"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {money(
              row.original.amount_minor - row.original.paid_amount_minor,
              row.original.currency,
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => <BillStatusBadge bill={row.original} />,
      },
    ],
    [t, money, day, periodLabel, studentMap],
  );

  return (
    <div className="flex flex-col md:min-h-0 md:flex-1">
      <DataTable
        stateKey="features/billing/components/bills-list-view:1"
        mode="cursor"
        data={rows}
        columns={columns}
        rowCount={rows.length}
        searchable={false}
        filters={filters}
        isLoading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(item) => item.id}
        onRowActivate={(row) => {
          setSelectedBillId(row.id);
        }}
        fillHeight
        cursorPagination={{
          hasPrevious: paging.hasPrevious,
          hasNext: paging.hasNextFor(rows.length),
          onPrevious: paging.goPrevious,
          onNext: paging.goNext,
          page: paging.page,
          pageSize: paging.limit,
        }}
        emptyState={
          filtered ? (
            <FilteredEmptyState
              searchable={false}
              onReset={() => {
                setPeriod("");
                setStatus("");
                setClassId("");
                paging.resetPage();
              }}
            />
          ) : (
            <EmptyState
              icon={<domainIcons.billing />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          )
        }
      />
      <BillDetailSheet
        billId={selectedBillId}
        onOpenChange={(open) => {
          if (!open) setSelectedBillId(null);
        }}
      />
    </div>
  );
}
