"use client";

import { Badge, DataTable, type DataTableProps } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import type { UserImportRow, UserImportRowResult } from "../api";

interface PreviewRow {
  rowNumber: number;
  row: UserImportRow;
  result?: UserImportRowResult;
}

/** A blank cell reads as missing data, so render an explicit dash instead. */
function orDash(value: string): string {
  return value === "" ? "-" : value;
}

/**
 * Row-by-row outcome from preview or commit, joined back to the parsed
 * row so the table can show the name/kind the admin will recognize
 * alongside the row number and any errors. `onlyProblems` keeps the rows
 * with errors.
 */
export function UserImportPreviewTable({
  rows,
  results,
  onlyProblems = false,
}: {
  rows: UserImportRow[];
  results: UserImportRowResult[];
  onlyProblems?: boolean;
}): ReactElement {
  const t = useTranslations("app.school.users.import");
  const tKinds = useTranslations("app.school.users.kinds");

  const data = useMemo<PreviewRow[]>(() => {
    const resultByRow = new Map(results.map((r) => [r.row_number, r]));
    return rows
      .map((row, index) => {
        const rowNumber = row.row_number ?? index + 1;
        return { rowNumber, row, result: resultByRow.get(rowNumber) };
      })
      .filter((item) => !onlyProblems || (item.result?.errors.length ?? 0) > 0);
  }, [onlyProblems, results, rows]);

  const columns = useMemo<DataTableProps<PreviewRow>["columns"]>(
    () => [
      {
        id: "row",
        header: t("table.row"),
        accessorFn: (item) => item.rowNumber,
        meta: { card: "meta", align: "end" },
        cell: ({ getValue }) => (
          <span className="text-fg-muted tabular-nums">{getValue() as number}</span>
        ),
      },
      {
        id: "name",
        header: t("table.name"),
        accessorFn: (item) => item.row.name,
        meta: { card: "title" },
        cell: ({ row }) => <span className="font-medium">{orDash(row.original.row.name)}</span>,
      },
      {
        id: "kind",
        header: t("table.kind"),
        accessorFn: (item) => item.row.profile_kind,
        meta: { card: "meta" },
        cell: ({ row }) => {
          const kind = row.original.row.profile_kind;
          return tKinds.has(kind) ? tKinds(kind) : orDash(kind);
        },
      },
      {
        id: "username",
        header: t("table.username"),
        accessorFn: (item) => item.result?.username ?? item.row.username ?? "",
        meta: { card: "subtitle" },
        cell: ({ getValue }) => (
          <span className="text-fg-muted">{orDash(getValue() as string)}</span>
        ),
      },
      {
        id: "status",
        header: t("table.status"),
        enableSorting: false,
        meta: { card: "field", label: t("table.status") },
        cell: ({ row }) => {
          const result = row.original.result;
          const errors = result?.errors ?? [];
          const action = result?.action;
          const changedFields = result?.changed_fields ?? [];
          if (errors.length > 0) {
            return (
              <div className="flex flex-col items-start gap-1">
                <Badge tone="danger" dot>
                  {t("table.invalid")}
                </Badge>
                <ul className="list-disc pl-4 text-caption text-danger">
                  {errors.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              </div>
            );
          }
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge tone={action === "unchanged" ? "neutral" : "success"}>
                {action ? t(`table.action.${action}`) : t("table.valid")}
              </Badge>
              {action === "update" && changedFields.length > 0 && (
                <span className="text-caption text-fg-muted">
                  {t("table.changedFields", { fields: changedFields.join(", ") })}
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [t, tKinds],
  );

  return (
    <DataTable
      toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
      mode="local"
      stateKey="features/school/components/user-import-preview-table:1"
      data={data}
      columns={columns}
      getRowId={(item) => String(item.rowNumber)}
      defaultPageSize={50}
    />
  );
}
