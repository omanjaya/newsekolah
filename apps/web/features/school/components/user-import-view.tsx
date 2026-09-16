"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Badge, Button, PageHeader, Stepper, useToast } from "@newsekolah/ui";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type UserImportRow,
  type UserImportRowResult,
  useCommitImportMutation,
  usePreviewImportMutation,
} from "../api";
import { downloadUserImportTemplate, parseUserImportFile } from "../lib/user-import";

import { UserImportPreviewTable } from "./user-import-preview-table";

type Stage = "upload" | "preview" | "done";

/**
 * Download template, upload the filled-in copy, preview every row's
 * errors, then commit. The API commits all 5000 rows in one transaction
 * (identity/service/import.go's CommitImport): a single invalid row
 * aborts the whole batch, so the preview step has to make that
 * consequence obvious rather than let an admin discover it from a 400.
 */
export function UserImportView(): ReactElement {
  const t = useTranslations("app.school.users.import");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [downloading, setDownloading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<UserImportRow[] | null>(null);
  const [results, setResults] = useState<UserImportRowResult[] | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [commitError, setCommitError] = useState<string | null>(null);

  const preview = usePreviewImportMutation();
  const commit = useCommitImportMutation();

  const fail = (error: unknown) =>
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );

  const errorCount = (results ?? []).filter((r) => r.errors.length > 0).length;
  const rowCount = rows?.length ?? 0;

  function reset() {
    setFileName(null);
    setParseError(null);
    setRows(null);
    setResults(null);
    setStage("upload");
    setCommitError(null);
  }

  async function handleFile(file: File) {
    reset();
    setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseUserImportFile(file);
      if (parsed.fileError || parsed.rows.length === 0) {
        setParseError(t(`parseError.${parsed.fileError ?? "empty"}`));
        return;
      }
      setRows(parsed.rows);
      const response = await preview.mutateAsync(parsed.rows);
      setResults(response.data);
      setStage("preview");
    } catch (error) {
      fail(error);
    } finally {
      setParsing(false);
    }
  }

  async function handleCommit() {
    if (!rows) return;
    setCommitError(null);
    try {
      const response = await commit.mutateAsync(rows);
      setResults(response.data);
      setStage("done");
      toast.success(t("committed", { n: rows.length }));
    } catch (error) {
      setCommitError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const steps = [
    { id: "upload", label: t("steps.upload") },
    { id: "preview", label: t("steps.preview") },
    { id: "done", label: t("steps.done") },
  ];
  const currentIndex = stage === "upload" ? 0 : stage === "preview" ? 1 : 2;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <Stepper steps={steps} currentIndex={currentIndex} />

      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("step1Title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("step1Body")}</p>
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Download />}
            loading={downloading}
            onClick={() => {
              setDownloading(true);
              downloadUserImportTemplate()
                .catch(fail)
                .finally(() => {
                  setDownloading(false);
                });
            }}
          >
            {t("downloadTemplate")}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("step2Title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("step2Body")}</p>
        <label className="flex w-fit flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("chooseFile")}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label={t("chooseFile")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFile(file);
            }}
            className="text-[13px] text-fg file:mr-3 file:rounded-xs file:border file:border-border file:bg-bg file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
          />
        </label>
        {parsing && (
          <p className="flex items-center gap-2 text-[13px] text-fg-muted">
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            {t("parsing", { file: fileName ?? "" })}
          </p>
        )}
        {parseError && (
          <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
            {parseError}
          </p>
        )}
      </section>

      {rows && results && (
        <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[16px] font-medium text-fg">{t("step3Title")}</h2>
            <div className="flex flex-wrap gap-2 text-[13px]">
              <Badge variant="neutral">{t("rowCount", { n: rowCount })}</Badge>
              {errorCount > 0 && (
                <Badge variant="accent">{t("invalidCount", { n: errorCount })}</Badge>
              )}
            </div>
          </div>

          {stage !== "done" &&
            (errorCount > 0 ? (
              <Alert variant="warning" title={t("blockedTitle")}>
                {t("blockedBody")}
              </Alert>
            ) : (
              <Alert title={t("readyTitle")}>{t("readyBody", { n: rowCount })}</Alert>
            ))}

          {stage === "done" && (
            <Alert title={t("doneTitle")}>{t("doneBody", { n: rowCount })}</Alert>
          )}

          {commitError && (
            <p
              role="alert"
              className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]"
            >
              {commitError}
            </p>
          )}

          <UserImportPreviewTable rows={rows} results={results} />

          {stage !== "done" && (
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" size="sm" onClick={reset}>
                {t("startOver")}
              </Button>
              <Button
                size="sm"
                icon={<Upload />}
                disabled={errorCount > 0}
                loading={commit.isPending}
                onClick={() => void handleCommit()}
              >
                {t("commit")}
              </Button>
            </div>
          )}
          {stage === "done" && (
            <div className="flex justify-end border-t border-border pt-4">
              <Button variant="secondary" size="sm" onClick={reset}>
                {t("importAnother")}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
