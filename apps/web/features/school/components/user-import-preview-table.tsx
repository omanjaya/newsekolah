"use client";

import { Badge, DataTable, type DataTableProps } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import type { UserImportRow, UserImportRowError, UserImportRowResult } from "../api";
import { importRowErrors } from "../lib/user-import";

interface PreviewRow {
  rowNumber: number;
  row: UserImportRow;
  result?: UserImportRowResult;
}

/**
 * The API sends each row error as a code (never a sentence), so it reads in
 * the admin's language; a code this build does not know yet still says the
 * row is invalid rather than showing the raw code.
 */
function rowErrorMessage(
  t: ReturnType<typeof useTranslations<"app.school.users.import">>,
  error: UserImportRowError,
): string {
  const key = `rowError.${error.code}`;
  return t.has(key) ? t(key, error.params ?? {}) : t("rowError.unknown");
}

/**
 * The API names each changed field by its template column identifier
 * (guardian_phone, employment_status, ...), which is a contract, not a
 * label: each one reads as the admin's own field name, and an identifier
 * this build does not know yet is shown as sent rather than dropped.
 */
function changedFieldLabel(
  t: ReturnType<typeof useTranslations<"app.school.users.import">>,
  field: string,
): string {
  const key = `field.${field}`;
  return t.has(key) ? t(key) : field;
}

/** A blank cell reads as missing data, so render an explicit dash instead. */
function orDash(value: string): string {
  return value === "" ? "-" : value;
}

/**
 * Row-by-row outcome from preview or commit, joined back to the parsed
 * row so the table can show the name/kind the admin will recognize
 * alongside the row number and any errors. `onlyProblems` keeps the rows
 * with errors. `committed` says the results are the commit's, so each row
 * reads what was done ("Dibuat") rather than what will be ("Akan dibuat").
 */
export function UserImportPreviewTable({
  rows,
  results,
  onlyProblems = false,
  committed = false,
}: {
  rows: UserImportRow[];
  results: UserImportRowResult[];
  onlyProblems?: boolean;
  committed?: boolean;
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
      .filter((item) => !onlyProblems || importRowErrors(item.result).length > 0);
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
          const errors = importRowErrors(result);
          const action = result?.action;
          const changedFields = result?.changed_fields ?? [];
          if (errors.length > 0) {
            return (
              <div className="flex flex-col items-start gap-1">
                <Badge tone="danger" dot>
                  {t("table.invalid")}
                </Badge>
                <ul className="list-disc pl-4 text-caption text-danger">
                  {errors.map((error, i) => (
                    <li key={i}>{rowErrorMessage(t, error)}</li>
                  ))}
                </ul>
              </div>
            );
          }
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge tone={action === "unchanged" ? "neutral" : "success"}>
                {action
                  ? t(committed ? `table.done.${action}` : `table.action.${action}`)
                  : t("table.valid")}
              </Badge>
              {action === "update" && changedFields.length > 0 && (
                <span className="text-caption text-fg-muted">
                  {t("table.changedFields", {
                    fields: changedFields.map((field) => changedFieldLabel(t, field)).join(", "),
                  })}
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [t, tKinds, committed],
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
