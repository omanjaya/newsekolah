"use client";

import { type Locale, formatCurrency, formatDate } from "@newsekolah/i18n";
import { Badge, Button, DataTable, EmptyState, Input, Select, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import { type Bill, type BillStatus, useBillsQuery } from "../api";

import { BillDetailSheet } from "./bill-detail-sheet";

const STATUS_VALUES: BillStatus[] = ["unpaid", "partial", "paid"];
const ALL = "all";
const PAGE_SIZE = 50;

/**
 * Every bill this year, filterable by period, status and class -- the
 * cross-student view the front desk's per-student `PaymentDeskView` does
 * not give. Picking a row opens `BillDetailSheet` for that bill's own
 * fields and payments.
 */
export function BillsListView(): ReactElement {
  const t = useTranslations("app.billing.bills");
  const locale = useLocale() as Locale;
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const classes = useClassesQuery();

  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState<BillStatus | "">("");
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(0);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useBillsQuery(
    { period, status, classId },
    { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
  );
  const rows = data?.data ?? [];
  const hasNext = rows.length === PAGE_SIZE;

  const classOptions = [
    { value: ALL, label: t("classAll") },
    ...(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const columns = useMemo<ColumnDef<Bill>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        // A real button so a mouse can open the detail on desktop, where the
        // table row itself only activates from the keyboard.
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left text-fg underline-offset-2 hover:underline focus-visible:underline"
            onClick={() => {
              setSelectedBillId(row.original.id);
            }}
          >
            {studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent")}
          </button>
        ),
      },
      { accessorKey: "fee_type_name", header: t("columns.feeType"), enableSorting: false },
      { accessorKey: "period", header: t("columns.period"), enableSorting: false },
      {
        id: "dueDate",
        header: t("columns.dueDate"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.due_date, { locale }),
      },
      {
        id: "amount",
        header: t("columns.amount"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatCurrency(row.original.amount_minor, row.original.currency, { locale })}
          </span>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "paid" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
    ],
    [t, locale, studentMap],
  );

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="col-span-2 flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("columns.period")}</span>
          <Input
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(0);
            }}
            className="w-full sm:w-44"
            aria-label={t("columns.period")}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("statusLabel")}</span>
          <Select
            options={[
              { value: ALL, label: t("statusAll") },
              ...STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
            ]}
            value={status || ALL}
            onValueChange={(value) => {
              setStatus(value === ALL ? "" : (value as BillStatus));
              setPage(0);
            }}
            placeholder={t("statusAll")}
            aria-label={t("statusLabel")}
            className="w-full sm:w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("classLabel")}</span>
          <Select
            options={classOptions}
            value={classId || ALL}
            onValueChange={(value) => {
              setClassId(value === ALL ? "" : value);
              setPage(0);
            }}
            placeholder={t("classAll")}
            aria-label={t("classLabel")}
            className="w-full sm:w-44"
          />
        </label>
      </div>
      {isError ? (
        <QueryError retry={refetch} />
      ) : (
        <div className="flex flex-col md:min-h-0 md:flex-1">
          <DataTable
            stateKey="features/billing/components/bills-list-view:1"
            mode="cursor"
            data={rows}
            columns={columns}
            rowCount={rows.length}
            searchable={false}
            isLoading={isLoading}
            getRowId={(item) => item.id}
            onRowActivate={(row) => {
              setSelectedBillId(row.id);
            }}
            fillHeight
            emptyState={
              <EmptyState
                icon={<domainIcons.billing aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            }
          />
        </div>
      )}
      {(page > 0 || hasNext) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 0}
            onClick={() => {
              setPage((p) => Math.max(0, p - 1));
            }}
          >
            {t("pagePrev")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasNext}
            onClick={() => {
              setPage((p) => p + 1);
            }}
          >
            {t("pageNext")}
          </Button>
        </div>
      )}
      <BillDetailSheet
        billId={selectedBillId}
        onOpenChange={(open) => {
          if (!open) setSelectedBillId(null);
        }}
      />
    </div>
  );
}
