"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, Select, Skeleton, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import {
  type EraporFormat,
  downloadEraporExport,
  downloadEraporExportLegacy,
  useEraporPreviewQuery,
  useTermsQuery,
} from "../api";

const MAX_ROWS_SHOWN = 10;

/**
 * Lets a teacher or curriculum lead see what an e-Rapor export for one
 * class and term would contain -- and what it would leave out -- before
 * downloading it. The download itself carries the same skip report as a
 * second sheet (or CSV section), so nothing here is lost once the file
 * lands on disk.
 */
export function EraporExport(): ReactElement {
  const t = useTranslations("app.grading.erapor");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const terms = useTermsQuery();

  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [format, setFormat] = useState<EraporFormat>("xlsx");
  const [downloading, setDownloading] = useState(false);
  const [legacySubjectId, setLegacySubjectId] = useState("");
  const [legacyDownloading, setLegacyDownloading] = useState(false);

  const effectiveClassId = classId || (classes.data?.data[0]?.id ?? "");
  const preview = useEraporPreviewQuery(effectiveClassId, termId || undefined);

  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const subjectOptions = (subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const termOptions = [
    { value: "", label: t("allTerms") },
    ...(terms.data?.data ?? []).map((term) => ({ value: term.id, label: term.name })),
  ];
  const formatOptions = [
    { value: "xlsx", label: t("formatXlsx") },
    { value: "csv", label: t("formatCsv") },
  ];

  async function download() {
    if (!effectiveClassId) return;
    setDownloading(true);
    try {
      await downloadEraporExport(effectiveClassId, termId || undefined, format);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloading(false);
    }
  }

  async function downloadLegacy() {
    if (!effectiveClassId || !legacySubjectId) return;
    setLegacyDownloading(true);
    try {
      await downloadEraporExportLegacy(effectiveClassId, legacySubjectId, termId || undefined);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setLegacyDownloading(false);
    }
  }

  const rows = preview.data?.rows ?? [];
  const skipped = preview.data?.skipped ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1 text-[13px] md:w-auto">
          <span className="font-medium">{t("pickTerm")}</span>
          <Select
            options={termOptions}
            value={termId}
            onValueChange={setTermId}
            className="w-full md:w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("formatLabel")}</span>
          <Select
            options={formatOptions}
            value={format}
            onValueChange={(value) => {
              setFormat(value as EraporFormat);
            }}
            className="w-40"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-[13px] md:w-auto">
          <span className="font-medium">{t("pickClass")}</span>
          <Select
            options={classOptions}
            value={effectiveClassId}
            onValueChange={setClassId}
            className="w-full md:w-56"
          />
        </label>
        <Button
          icon={<Download />}
          loading={downloading}
          disabled={!effectiveClassId || rows.length === 0}
          onClick={() => void download()}
        >
          {t("download")}
        </Button>
      </div>

      {preview.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : preview.isError ? (
        <Alert
          variant="warning"
          title={
            preview.error instanceof ApiError
              ? apiErrorMessage(preview.error.code)
              : apiErrorMessage("UNKNOWN")
          }
        >
          {t("previewError")}
        </Alert>
      ) : (
        <>
          <p className="text-[13px] text-fg-muted">
            {t("summary", { rows: rows.length, skipped: skipped.length })}
          </p>

          <section className="flex flex-col gap-2">
            <h3 className="text-[14px] font-medium text-fg">{t("rowsTitle")}</h3>
            {rows.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("rowsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-fg-muted">
                      <th className="px-3 py-2 font-medium">{t("rowsColumnNisn")}</th>
                      <th className="px-3 py-2 font-medium">{t("rowsColumnSubject")}</th>
                      <th className="px-3 py-2 font-medium">{t("rowsColumnScore")}</th>
                      <th className="px-3 py-2 font-medium">{t("rowsColumnPredicate")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, MAX_ROWS_SHOWN).map((row) => (
                      <tr key={`${row.nisn}-${row.subject_code}`}>
                        <td className="px-3 py-2 text-fg">{row.nisn}</td>
                        <td className="px-3 py-2 text-fg">{row.subject_code}</td>
                        <td className="px-3 py-2 text-fg">{row.score}</td>
                        <td className="px-3 py-2 text-fg">{row.predicate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > MAX_ROWS_SHOWN && (
                  <p className="border-t border-border px-3 py-2 text-[13px] text-fg-muted">
                    {t("rowsMore", { count: rows.length - MAX_ROWS_SHOWN })}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-[14px] font-medium text-fg">{t("skippedTitle")}</h3>
            {skipped.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t("skippedEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-sm border border-border">
                {skipped.map((skip) => (
                  <li
                    key={`${skip.student_name}-${skip.subject_name}-${skip.reason}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
                  >
                    <span className="text-fg">
                      {t("skippedRow", { student: skip.student_name, subject: skip.subject_name })}
                    </span>
                    <span className="text-fg-muted">{t(`reason.${skip.reason}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h3 className="text-[14px] font-medium text-fg">{t("legacyTitle")}</h3>
        <p className="text-[13px] text-fg-muted">{t("legacyHint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full flex-col gap-1 text-[13px] md:w-auto">
            <span className="font-medium">{t("legacySubject")}</span>
            <Select
              options={subjectOptions}
              value={legacySubjectId}
              onValueChange={setLegacySubjectId}
              className="w-full md:w-56"
            />
          </label>
          <Button
            variant="secondary"
            icon={<Download />}
            loading={legacyDownloading}
            disabled={!effectiveClassId || !legacySubjectId}
            onClick={() => void downloadLegacy()}
          >
            {t("legacyDownload")}
          </Button>
        </div>
      </section>
    </div>
  );
}
