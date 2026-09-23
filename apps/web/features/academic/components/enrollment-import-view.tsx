"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge, Button, Checkbox, PageHeader, Select, useToast } from "@newsekolah/ui";
import { Download, FileSpreadsheet, FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useAcademicYearsQuery } from "../api";
import { type ImportRowResult, useEnrollmentImportMutation } from "../api-enrollment";
import { downloadEnrollmentImportTemplate } from "../lib/enrollment-import";

const ERROR_ACTION_TEXT: Record<ImportRowResult["action"], string> = {
  assign: "",
  move: "",
  unchanged: "",
  skipped: "text-status-permitted",
  error: "text-status-absent",
};

/**
 * Downloads the class-assignment template, then walks the school through
 * previewing every row's outcome before committing anything -- the same
 * uploaded workbook is re-sent to `commit` once the preview looks right.
 */
export function EnrollmentImportView(): ReactElement {
  const t = useTranslations("app.academic.enrollmentImport");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const activeYear = useActiveYear();
  const years = useAcademicYearsQuery();
  const [yearId, setYearId] = useState("");
  const effectiveYearId = yearId || activeYear.id;

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRowResult[] | null>(null);
  const [committed, setCommitted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [moveExisting, setMoveExisting] = useState(false);
  const [partial, setPartial] = useState(false);

  const preview = useEnrollmentImportMutation("preview");
  const commit = useEnrollmentImportMutation("commit");

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const errorCount = (rows ?? []).filter((r) => r.action === "error").length;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <label className="flex w-full flex-col md:w-fit gap-1 text-[13px]">
        <span className="font-medium">{t("year")}</span>
        <Select
          options={(years.data?.data ?? []).map((y) => ({ value: y.id, label: y.label }))}
          value={effectiveYearId}
          onValueChange={setYearId}
          className="w-full md:w-64"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Download />}
          loading={downloading}
          disabled={!effectiveYearId}
          onClick={() => {
            setDownloading(true);
            downloadEnrollmentImportTemplate(effectiveYearId)
              .catch(fail)
              .finally(() => {
                setDownloading(false);
              });
          }}
        >
          {t("downloadTemplate")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xs border border-border bg-surface p-4">
        <div className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("chooseFile")}</span>
          <input
            id="enrollment-import-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label={t("chooseFile")}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRows(null);
              setCommitted(false);
            }}
            className="peer sr-only"
          />
          {/* The native file button cannot be sized for a thumb, so the
              input stays for keyboard and screen readers and this label is
              what is tapped; it shows the input's focus ring. */}
          <label
            htmlFor="enrollment-import-file"
            className="flex h-11 w-fit max-w-full cursor-pointer items-center gap-2 rounded-sm border border-border px-3 text-[13px] text-fg hover:bg-bg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent md:h-8"
          >
            <FileUp className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{file ? file.name : t("noFileChosen")}</span>
          </label>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-[13px] md:min-h-0">
          <Checkbox
            checked={moveExisting}
            onCheckedChange={(v) => {
              setMoveExisting(v === true);
            }}
          />
          {t("moveExisting")}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[13px] md:min-h-0">
          <Checkbox
            checked={partial}
            onCheckedChange={(v) => {
              setPartial(v === true);
            }}
          />
          {t("partial")}
        </label>

        <div>
          <Button
            size="sm"
            icon={<FileSpreadsheet />}
            disabled={!file || !effectiveYearId}
            loading={preview.isPending}
            onClick={() => {
              if (!file) return;
              preview.mutate(
                { academicYearId: effectiveYearId, file, moveExisting, partial },
                {
                  onSuccess: (data) => {
                    setRows(data);
                    setCommitted(false);
                  },
                  onError: fail,
                },
              );
            }}
          >
            {t("preview")}
          </Button>
        </div>
      </div>

      {rows && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-[13px]">
            <Badge variant="neutral">{t("rowCount", { n: rows.length })}</Badge>
            {errorCount > 0 && <Badge variant="accent">{t("errorCount", { n: errorCount })}</Badge>}
          </div>
          <div className="overflow-x-auto rounded-xs border border-border">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-bg text-left text-fg-muted">
                <tr>
                  <th className="px-3 py-2">{t("table.row")}</th>
                  <th className="px-3 py-2">{t("table.student")}</th>
                  <th className="px-3 py-2">{t("table.class")}</th>
                  <th className="px-3 py-2">{t("table.action")}</th>
                  <th className="px-3 py-2">{t("table.message")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.row_number} className="border-t border-border">
                    <td className="px-3 py-2 text-fg-muted">{row.row_number}</td>
                    <td className="px-3 py-2">
                      {row.student_name ?? row.nis ?? row.username ?? "-"}
                    </td>
                    <td className="px-3 py-2">{row.class_name ?? "-"}</td>
                    <td className={`px-3 py-2 ${ERROR_ACTION_TEXT[row.action]}`}>
                      {t(`action.${row.action}`)}
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{row.message ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <Button
              disabled={committed || errorCount === rows.length}
              loading={commit.isPending}
              onClick={() => {
                if (!file) return;
                commit.mutate(
                  { academicYearId: effectiveYearId, file, moveExisting, partial },
                  {
                    onSuccess: (data) => {
                      setRows(data);
                      setCommitted(true);
                      toast.success(t("committed"));
                    },
                    onError: fail,
                  },
                );
              }}
            >
              {committed ? t("committedLabel") : t("commit")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
