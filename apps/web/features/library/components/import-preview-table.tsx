"use client";

import { Alert, Badge, Button, DataTable, FormActions, Stat, StatGrid } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookCopy, BookPlus, BookUp, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import type { LibraryImportPreview } from "../import-api";

type PreviewRow = LibraryImportPreview["rows"][number];

/**
 * Step 3 of the import: the counts as one strip, a warning when rows will
 * be skipped, every row's status and message in the shared table (cards on
 * a phone), and the commit decision at the end, never hidden.
 */
export function ImportPreviewTable({
  preview,
  onBack,
  onCommit,
  committing,
}: {
  preview: LibraryImportPreview;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
}): ReactElement {
  const t = useTranslations("app.library.import.preview");
  const errorCount = preview.summary.errors;
  const importableCount = preview.summary.new_titles + preview.summary.existing_titles;

  const columns = useMemo<ColumnDef<PreviewRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("columns.title"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) => row.original.title || "-",
      },
      {
        accessorKey: "row_number",
        header: t("columns.row"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.row_number}</span>,
      },
      {
        accessorKey: "copies",
        header: t("columns.copies"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.copies}</span>,
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge
            tone={
              row.original.status === "error"
                ? "danger"
                : row.original.status === "new_title"
                  ? "success"
                  : "info"
            }
          >
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: "message",
        header: t("columns.message"),
        enableSorting: false,
        cell: ({ row }) => row.original.message || "-",
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-4">
      <StatGrid variant="strip" aria-label={t("summaryLabel")}>
        <Stat
          icon={<BookPlus />}
          category="green"
          value={preview.summary.new_titles}
          label={t("summary.newTitles")}
        />
        <Stat
          icon={<BookUp />}
          category="blue"
          value={preview.summary.existing_titles}
          label={t("summary.existingTitles")}
        />
        <Stat
          icon={<BookCopy />}
          category="purple"
          value={preview.summary.copies}
          label={t("summary.copies")}
        />
        <Stat
          icon={<CircleAlert />}
          category="red"
          value={preview.summary.errors}
          label={t("summary.errors")}
        />
      </StatGrid>

      {errorCount > 0 && (
        <Alert
          tone={importableCount > 0 ? "warning" : "danger"}
          title={
            importableCount > 0
              ? t("partialWarning", { errors: errorCount, importable: importableCount })
              : t("allErrorWarning", { errors: errorCount })
          }
        />
      )}

      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        stateKey="features/library/components/import-preview-table:1"
        mode="local"
        data={preview.rows}
        columns={columns}
        searchable={preview.rows.length > 10}
        getRowId={(row) => String(row.row_number)}
      />

      <FormActions align="between">
        <Button variant="secondary" onClick={onBack} disabled={committing}>
          {t("back")}
        </Button>
        <Button onClick={onCommit} loading={committing} disabled={importableCount === 0}>
          {importableCount > 0 && errorCount > 0
            ? t("commitPartial", { count: importableCount })
            : t("commit")}
        </Button>
      </FormActions>
    </div>
  );
}
