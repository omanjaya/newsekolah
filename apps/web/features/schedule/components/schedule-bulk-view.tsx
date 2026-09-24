"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, PageHeader, Textarea, cn, useToast } from "@newsekolah/ui";
import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent, ReactElement } from "react";
import { useMemo, useRef, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  useClassesQuery,
  useLookup,
  usePeriodsQuery,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../reference/api";
import { useBulkImportSchedulesMutation } from "../api";
import { conflictMessage } from "../conflict-message";
import { parseBulkImportCsv, type BulkImportRow } from "../csv-import";

import { ClearSchedulesSection } from "./clear-schedules-section";

export function ScheduleBulkView(): ReactElement {
  const t = useTranslations("app.schedule.bulk");
  // Conflict messages ("period X in class Y is already taken by...") are
  // shared copy from the parent schedule namespace, the same sentence the
  // grid and the single-block form use.
  const tSchedule = useTranslations("app.schedule");
  const canManage = useCan("manage_schedules");
  const year = useActiveYear();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const teachers = useTeachersQuery();
  const periods = usePeriodsQuery();
  const bulkImport = useBulkImportSchedulesMutation();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const teacherMap = useLookup(teachers.data?.data);

  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  // Kept separate from the toast: a bulk import is atomic (see
  // ClearSchedulesSection's note and useBulkImportSchedulesMutation), so a
  // conflict here means every row in this batch was rolled back, not just
  // one -- worth a sentence the operator can actually read and act on
  // rather than a toast that is gone before the row it names is found.
  const [importError, setImportError] = useState<string | null>(null);

  const rows = useMemo<BulkImportRow[]>(() => {
    if (csvText.trim() === "" || year.id === "") return [];
    return parseBulkImportCsv(csvText, {
      academicYearId: year.id,
      classes: (classes.data?.data ?? []).map((c) => ({ id: c.id, name: c.name })),
      subjects: (subjects.data?.data ?? []).map((s) => ({ id: s.id, name: s.name })),
      teachers: (teachers.data?.data ?? []).map((u) => ({ id: u.id, name: u.name })),
      periods: (periods.data?.data ?? []).map((p) => ({ id: p.id, name: p.name })),
    });
  }, [csvText, year.id, classes.data, subjects.data, teachers.data, periods.data]);

  const resolvedRows = rows
    .map((row) => row.resolved)
    .filter((resolved): resolved is NonNullable<typeof resolved> => resolved !== undefined);
  const invalidCount = rows.length - resolvedRows.length;

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(file);
  }

  function handleApply() {
    setImportError(null);
    bulkImport.mutate(resolvedRows, {
      onSuccess: (result) => {
        toast.success(t("importSection.applied", { count: result.data.length }));
        setCsvText("");
        setFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      onError: (error) => {
        const named = conflictMessage(
          error,
          { classMap, subjectMap, teacherMap, periods: periods.data?.data ?? [] },
          tSchedule,
        );
        setImportError(
          named ??
            (error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN")),
        );
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("importSection.title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("importSection.body")}</p>

        <div className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("importSection.uploadLabel")}</span>
          <input
            id="schedule-bulk-import-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            aria-label={t("importSection.uploadLabel")}
            onChange={handleFile}
            disabled={!canManage}
            className="peer sr-only"
          />
          <label
            htmlFor="schedule-bulk-import-file"
            className={cn(
              "flex h-11 w-fit max-w-full items-center gap-2 rounded-sm border border-border px-3 text-[13px] text-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent md:h-8",
              canManage ? "cursor-pointer hover:bg-bg" : "cursor-not-allowed opacity-60",
            )}
          >
            <FileUp className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{fileName ?? t("importSection.noFileChosen")}</span>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("importSection.textareaLabel")}</span>
          <Textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setImportError(null);
            }}
            rows={8}
            disabled={!canManage}
            className="font-mono text-[12px]"
          />
        </label>

        <div className="flex flex-col gap-3">
          <h3 className="text-[14px] font-medium text-fg">{t("importSection.previewTitle")}</h3>
          {rows.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("importSection.empty")}</p>
          ) : (
            <>
              <p className="text-[13px] text-fg-muted">
                {t("importSection.previewSummary", {
                  valid: resolvedRows.length,
                  invalid: invalidCount,
                })}
              </p>
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead>
                    <tr className="bg-bg text-left text-fg-muted">
                      <th scope="col" className="px-3 py-2 font-medium">
                        {t("importSection.columnLine")}
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {t("importSection.columnStatus")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr key={row.line}>
                        <td className="px-3 py-2 text-fg">{row.line}</td>
                        <td className="px-3 py-2">
                          {row.resolved ? (
                            <span className="text-fg">{t("importSection.statusValid")}</span>
                          ) : (
                            <span className="text-status-absent">
                              {t("importSection.statusInvalid", { columns: row.errors.join(", ") })}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importError && (
                <Alert variant="warning" title={t("importSection.applyErrorTitle")}>
                  <p>{importError}</p>
                </Alert>
              )}
              {canManage && (
                <Button
                  size="sm"
                  disabled={resolvedRows.length === 0 || invalidCount > 0}
                  loading={bulkImport.isPending}
                  onClick={handleApply}
                >
                  {t("importSection.apply", { count: resolvedRows.length })}
                </Button>
              )}
            </>
          )}
        </div>
      </section>

      {canManage && <ClearSchedulesSection academicYearId={year.id} yearLabel={year.label} />}
    </div>
  );
}
