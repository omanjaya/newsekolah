"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FileDropzone,
  FormActions,
  FormSection,
  SectionHeader,
  Select,
  Stat,
  StatGrid,
  Switch,
  useToast,
} from "@newsekolah/ui";
import {
  Download,
  Equal,
  FileSpreadsheet,
  TriangleAlert,
  Upload,
  UserPen,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type UserImportMode,
  type UserImportRow,
  type UserImportRowResult,
  useCommitImportMutation,
  usePreviewImportMutation,
} from "../api";
import { downloadUserImportTemplate, parseUserImportFile } from "../lib/user-import";

import { ImportProgress, ImportRowFilter, XLSX_ACCEPT, type ImportStage } from "./import-layout";
import { UserImportPreviewTable } from "./user-import-preview-table";

type Stage = ImportStage;

/**
 * Download template, upload the filled-in copy, preview every row's
 * errors, then commit. The API commits all 5000 rows in one transaction
 * (identity/service/import.go's CommitImport): a single invalid row
 * aborts the whole batch, so the preview step has to make that
 * consequence obvious rather than let an admin discover it from a 400.
 */
export function UserImportView(): ReactElement {
  const t = useTranslations("app.school.users.import");
  const tFlow = useTranslations("app.school.importFlow");
  const tNav = useTranslations("app.shell.nav.items");
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
  const [mode, setMode] = useState<UserImportMode>("create");
  const [updateRoles, setUpdateRoles] = useState(false);
  const [rowFilter, setRowFilter] = useState<"all" | "problems">("all");

  const preview = usePreviewImportMutation();
  const commit = useCommitImportMutation();

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const errorCount = (results ?? []).filter((r) => r.errors.length > 0).length;
  const createCount = (results ?? []).filter((r) => r.action === "create").length;
  const updateCount = (results ?? []).filter((r) => r.action === "update").length;
  const unchangedCount = (results ?? []).filter((r) => r.action === "unchanged").length;
  const rowCount = rows?.length ?? 0;

  function reset() {
    setFileName(null);
    setParseError(null);
    setRows(null);
    setResults(null);
    setStage("upload");
    setCommitError(null);
    setRowFilter("all");
  }

  async function runPreview(
    fileRows: UserImportRow[],
    nextMode: UserImportMode,
    nextUpdateRoles: boolean,
  ) {
    const response = await preview.mutateAsync({
      rows: fileRows,
      mode: nextMode,
      updateRoles: nextMode === "upsert" && nextUpdateRoles,
    });
    setResults(response.data);
    setStage("preview");
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
      await runPreview(parsed.rows, mode, updateRoles);
    } catch (error) {
      fail(error);
    } finally {
      setParsing(false);
    }
  }

  /** Mode/update-roles only take effect on the next preview: changing them
   * after a file was already parsed re-runs preview against the same
   * parsed rows, rather than silently leaving stale results on screen. */
  function handleModeChange(next: UserImportMode) {
    setMode(next);
    if (rows && stage === "preview") void runPreview(rows, next, updateRoles).catch(fail);
  }
  function handleUpdateRolesChange(next: boolean) {
    setUpdateRoles(next);
    if (rows && stage === "preview" && mode === "upsert")
      void runPreview(rows, mode, next).catch(fail);
  }

  async function handleCommit() {
    if (!rows) return;
    setCommitError(null);
    try {
      const response = await commit.mutateAsync({
        rows,
        mode,
        updateRoles: mode === "upsert" && updateRoles,
      });
      setResults(response.data);
      setStage("done");
      toast.success(t("committed", { n: rows.length }));
    } catch (error) {
      setCommitError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const problemsOnly = rowFilter === "problems" && errorCount > 0;

  return (
    <AppPage
      title={t("title")}
      description={t("description")}
      breadcrumb={[{ label: tNav("users"), href: "/school/users" }, { label: t("title") }]}
      nav={false}
    >
      <ImportProgress stage={stage} />

      {stage !== "done" && (
        <Card padding="md">
          <CardHeader>
            <CardTitle as="h2">{t("prepareTitle")}</CardTitle>
            <CardDescription>{t("step1Body")}</CardDescription>
          </CardHeader>
          <div>
            <Button
              variant="secondary"
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
          <FormSection columns={2} className="border-t border-line pt-5">
            <Field
              label={t("mode.label")}
              hint={mode === "upsert" ? t("mode.upsertBody") : t("mode.createBody")}
            >
              <Select
                value={mode}
                onValueChange={(v) => {
                  handleModeChange(v as UserImportMode);
                }}
                options={[
                  { value: "create", label: t("mode.create") },
                  { value: "upsert", label: t("mode.upsert") },
                ]}
              />
            </Field>
            {mode === "upsert" && (
              <Field
                label={t("mode.updateRolesLabel")}
                hint={t("mode.updateRolesBody")}
                orientation="horizontal"
              >
                <Switch checked={updateRoles} onCheckedChange={handleUpdateRolesChange} />
              </Field>
            )}
            {/* The file can be dropped as well as picked; a file that cannot
                be read is said under the zone. */}
            <Field
              label={t("fileLabel")}
              hint={t("step2Body")}
              error={parseError ?? undefined}
              className="col-span-full"
            >
              <FileDropzone
                accept={XLSX_ACCEPT}
                fileName={parsing ? t("parsing", { file: fileName ?? "" }) : fileName}
                loading={parsing}
                chooseLabel={t("chooseFile")}
                replaceLabel={tFlow("chooseOther")}
                title={tFlow("noFile")}
                rejectMessage={t("parseError.unreadable")}
                onFile={(file) => {
                  void handleFile(file);
                }}
              />
            </Field>
          </FormSection>
        </Card>
      )}

      {rows && results && (
        <section className="flex flex-col gap-4" aria-labelledby="user-import-review">
          <SectionHeader titleId="user-import-review" title={t("reviewTitle")} />
          <StatGrid variant="strip" aria-label={t("reviewTitle")}>
            <Stat icon={<FileSpreadsheet />} tone="blue" label={t("rowsLabel")} value={rowCount} />
            {mode === "upsert" ? (
              <>
                <Stat
                  icon={<UserPlus />}
                  tone="green"
                  label={t("createLabel")}
                  value={createCount}
                />
                <Stat
                  icon={<UserPen />}
                  tone="purple"
                  label={t("updateLabel")}
                  value={updateCount}
                />
                <Stat
                  icon={<Equal />}
                  tone="amber"
                  label={t("unchangedLabel")}
                  value={unchangedCount}
                />
              </>
            ) : (
              <Stat
                icon={<UserPlus />}
                tone="green"
                label={t("createLabel")}
                value={rowCount - errorCount}
              />
            )}
            <Stat
              icon={<TriangleAlert />}
              tone={errorCount > 0 ? "red" : "green"}
              label={t("invalidLabel")}
              value={errorCount}
            />
          </StatGrid>

          {stage === "done" ? (
            <Alert tone="success" title={t("doneTitle")}>
              {mode === "upsert"
                ? t("doneBodyUpsert", {
                    created: createCount,
                    updated: updateCount,
                    unchanged: unchangedCount,
                  })
                : t("doneBody", { n: rowCount })}
            </Alert>
          ) : errorCount > 0 ? (
            <Alert tone="danger" title={t("blockedTitle")}>
              {t("blockedBody")}
            </Alert>
          ) : (
            <Alert tone="success" title={t("readyTitle")}>
              {mode === "upsert"
                ? t("readyBodyUpsert", {
                    created: createCount,
                    updated: updateCount,
                    unchanged: unchangedCount,
                  })
                : t("readyBody", { n: rowCount })}
            </Alert>
          )}

          {commitError && <Alert tone="danger" title={commitError} />}

          {errorCount > 0 && (
            <ImportRowFilter
              value={rowFilter}
              onValueChange={setRowFilter}
              total={rowCount}
              problems={errorCount}
            />
          )}
          <UserImportPreviewTable rows={rows} results={results} onlyProblems={problemsOnly} />

          <FormActions>
            {stage === "done" ? (
              <>
                <Button asChild variant="secondary">
                  <Link href="/school/users">{t("backToUsers")}</Link>
                </Button>
                <Button onClick={reset}>{t("importAnother")}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={reset}>
                  {t("startOver")}
                </Button>
                <Button
                  icon={<Upload />}
                  disabled={errorCount > 0}
                  loading={commit.isPending}
                  onClick={() => void handleCommit()}
                >
                  {t("commit")}
                </Button>
              </>
            )}
          </FormActions>
        </section>
      )}
    </AppPage>
  );
}
