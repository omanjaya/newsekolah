"use client";

import { Badge, Button } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LibraryImportPreview } from "../import-api";

import { ReportCard, ReportCardTitle, ReportField } from "./report-mobile-card";

/** Step 3: every row's status and message, with an explicit, visible commit decision. */
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

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-wrap gap-4 text-[13px]">
        <div className="flex items-center gap-1">
          <dt className="text-fg-muted">{t("summary.newTitles")}</dt>
          <dd className="font-medium text-fg">{preview.summary.new_titles}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="text-fg-muted">{t("summary.existingTitles")}</dt>
          <dd className="font-medium text-fg">{preview.summary.existing_titles}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="text-fg-muted">{t("summary.copies")}</dt>
          <dd className="font-medium text-fg">{preview.summary.copies}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="text-fg-muted">{t("summary.errors")}</dt>
          <dd className="font-medium text-status-absent">{preview.summary.errors}</dd>
        </div>
      </dl>

      {errorCount > 0 && (
        <p className="rounded-sm border border-status-absent/30 bg-status-absent/10 p-3 text-[13px] text-fg">
          {importableCount > 0
            ? t("partialWarning", { errors: errorCount, importable: importableCount })
            : t("allErrorWarning", { errors: errorCount })}
        </p>
      )}

      <ul className="flex flex-col gap-2 md:hidden">
        {preview.rows.map((row) => (
          <li key={row.row_number}>
            <ReportCard>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <ReportCardTitle>{row.title || "-"}</ReportCardTitle>
                <Badge variant={row.status === "error" ? "neutral" : "accent"}>
                  {t(`status.${row.status}`)}
                </Badge>
              </div>
              <ReportField
                label={t("columns.row")}
                value={<span className="tabular-nums">{row.row_number}</span>}
              />
              <ReportField
                label={t("columns.copies")}
                value={<span className="tabular-nums">{row.copies}</span>}
              />
              <ReportField label={t("columns.message")} value={row.message || "-"} />
            </ReportCard>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="bg-bg text-left text-fg-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.row")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.title")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.copies")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.status")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.message")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.rows.map((row) => (
              <tr
                key={row.row_number}
                className={row.status === "error" ? "bg-status-absent/5" : ""}
              >
                <td className="px-3 py-2 tabular-nums text-fg-muted">{row.row_number}</td>
                <td className="px-3 py-2 text-fg">{row.title || "-"}</td>
                <td className="px-3 py-2 tabular-nums text-fg-muted">{row.copies}</td>
                <td className="px-3 py-2">
                  <Badge variant={row.status === "error" ? "neutral" : "accent"}>
                    {t(`status.${row.status}`)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-fg-muted">{row.message || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onBack} disabled={committing}>
          {t("back")}
        </Button>
        <Button
          type="button"
          onClick={onCommit}
          loading={committing}
          disabled={importableCount === 0}
        >
          {importableCount > 0 && errorCount > 0
            ? t("commitPartial", { count: importableCount })
            : t("commit")}
        </Button>
      </div>
    </div>
  );
}
