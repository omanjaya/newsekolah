"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  Field,
  FileDropzone,
  FormActions,
  FormSection,
  SectionHeader,
  Select,
  Stat,
  StatGrid,
  useToast,
  type BadgeTone,
  type DataTableProps,
} from "@newsekolah/ui";
import { Download, FileSpreadsheet, School, SkipForward, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  ImportProgress,
  ImportRowFilter,
  XLSX_ACCEPT,
  type ImportStage,
} from "../../school/components/import-layout";
import { useAcademicYearsQuery } from "../api";
import { type ImportRowResult, useEnrollmentImportMutation } from "../api-enrollment";
import { downloadEnrollmentImportTemplate } from "../lib/enrollment-import";

const ACTION_TONE: Record<ImportRowResult["action"], BadgeTone> = {
  assign: "success",
  move: "info",
  unchanged: "neutral",
  skipped: "warning",
  error: "danger",
};

/**
 * Downloads the class-assignment template, then walks the school through
 * previewing every row's outcome before committing anything -- the same
 * uploaded workbook is re-sent to `commit` once the preview looks right.
 */
export function EnrollmentImportView(): ReactElement {
  const canViewClasses = useCan("view_academic_data");
  const tWorkspace = useTranslations("app.academic.workspace");
  const t = useTranslations("app.academic.enrollmentImport");
  const tFlow = useTranslations("app.school.importFlow");
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
  const [rowFilter, setRowFilter] = useState<"all" | "problems">("all");

  const preview = useEnrollmentImportMutation("preview");
  const commit = useEnrollmentImportMutation("commit");

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const errorCount = (rows ?? []).filter((r) => r.action === "error").length;
  const skippedCount = (rows ?? []).filter((r) => r.action === "skipped").length;
  const placedCount = (rows ?? []).filter(
    (r) => r.action === "assign" || r.action === "move",
  ).length;
  const stage: ImportStage = committed ? "done" : rows ? "preview" : "upload";
  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => rowFilter === "all" || r.action === "error" || r.action === "skipped",
      ),
    [rows, rowFilter],
  );

  function runPreview(nextFile: File) {
    preview.mutate(
      { academicYearId: effectiveYearId, file: nextFile, moveExisting, partial },
      {
        onSuccess: (data) => {
          setRows(data);
          setCommitted(false);
        },
        onError: fail,
      },
    );
  }

  function reset() {
    setFile(null);
    setRows(null);
    setCommitted(false);
    setRowFilter("all");
  }

  const columns = useMemo<DataTableProps<ImportRowResult>["columns"]>(
    () => [
      {
        id: "row",
        header: t("table.row"),
        accessorFn: (row) => row.row_number,
        meta: { card: "meta", align: "end" },
        cell: ({ getValue }) => (
          <span className="text-fg-muted tabular-nums">{getValue() as number}</span>
        ),
      },
      {
        id: "student",
        header: t("table.student"),
        accessorFn: (row) => row.student_name ?? row.nis ?? row.username ?? "",
        meta: { card: "title" },
        cell: ({ getValue }) => (
          <span className="font-medium">{(getValue() as string) || "-"}</span>
        ),
      },
      {
        id: "class",
        header: t("table.class"),
        accessorFn: (row) => row.class_name ?? "",
        meta: { card: "subtitle" },
        cell: ({ getValue }) => (getValue() as string) || "-",
      },
      {
        id: "outcome",
        header: t("table.action"),
        accessorFn: (row) => row.action,
        meta: { card: "meta", label: t("table.action") },
        cell: ({ row }) => (
          <Badge tone={ACTION_TONE[row.original.action]} dot={row.original.action === "error"}>
            {t(`action.${row.original.action}`)}
          </Badge>
        ),
      },
      {
        id: "message",
        header: t("table.message"),
        accessorFn: (row) => row.message ?? "",
        meta: { card: "field", label: t("table.message") },
        cell: ({ row }) => (
          <span className={row.original.action === "error" ? "text-danger" : "text-fg-muted"}>
            {row.original.message ?? "-"}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    // The area's header (Siswa dan kelas) over its tabs, as on the class
    // list; the "Siapkan berkas" card says what this page does.
    <AppPage>
      <ImportProgress stage={stage} />

      {!committed && (
        <Card padding="md">
          <CardHeader>
            <CardTitle as="h2">{t("prepareTitle")}</CardTitle>
            <CardDescription>{t("prepareBody")}</CardDescription>
          </CardHeader>
          <FormSection columns={2}>
            <Field label={t("year")}>
              <Select
                options={(years.data?.data ?? []).map((y) => ({ value: y.id, label: y.label }))}
                value={effectiveYearId}
                onValueChange={setYearId}
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="secondary"
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
            <Field label={t("optionsLabel")} className="col-span-full">
              {(control) => (
                <div role="group" aria-labelledby={control.labelId} className="flex flex-col gap-3">
                  <Checkbox
                    checked={moveExisting}
                    onCheckedChange={(v) => {
                      setMoveExisting(v === true);
                    }}
                    label={t("moveExisting")}
                  />
                  <Checkbox
                    checked={partial}
                    onCheckedChange={(v) => {
                      setPartial(v === true);
                    }}
                    label={t("partial")}
                  />
                </div>
              )}
            </Field>
            {/* The workbook can be dropped as well as picked; the preview
                says what is wrong with a file that cannot be read. */}
            <Field label={t("fileLabel")} disabled={!effectiveYearId} className="col-span-full">
              <FileDropzone
                accept={XLSX_ACCEPT}
                fileName={file?.name}
                loading={preview.isPending}
                chooseLabel={t("chooseFile")}
                replaceLabel={tFlow("chooseOther")}
                title={tFlow("noFile")}
                onFile={(next) => {
                  setFile(next);
                  setRows(null);
                  setCommitted(false);
                  runPreview(next);
                }}
              />
            </Field>
          </FormSection>
          {file && (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                icon={<FileSpreadsheet />}
                loading={preview.isPending}
                onClick={() => {
                  runPreview(file);
                }}
              >
                {t("previewAgain")}
              </Button>
            </div>
          )}
        </Card>
      )}

      {rows && (
        <section className="flex flex-col gap-4" aria-labelledby="enrollment-import-review">
          <SectionHeader titleId="enrollment-import-review" title={t("reviewTitle")} />
          <StatGrid variant="strip" aria-label={t("reviewTitle")}>
            <Stat
              icon={<FileSpreadsheet />}
              tone="blue"
              label={t("rowsLabel")}
              value={rows.length}
            />
            <Stat icon={<School />} tone="green" label={t("placedLabel")} value={placedCount} />
            <Stat
              icon={<SkipForward />}
              tone="amber"
              label={t("skippedLabel")}
              value={skippedCount}
            />
            <Stat
              icon={<TriangleAlert />}
              tone={errorCount > 0 ? "red" : "green"}
              label={t("errorLabel")}
              value={errorCount}
            />
          </StatGrid>
          {committed ? (
            <Alert tone="success" title={t("committed")} />
          ) : errorCount > 0 ? (
            <Alert tone={partial ? "warning" : "danger"} title={t("errorCount", { n: errorCount })}>
              {partial ? t("partialNote") : t("blockedNote")}
            </Alert>
          ) : null}
          {errorCount + skippedCount > 0 && (
            <ImportRowFilter
              value={rowFilter}
              onValueChange={setRowFilter}
              total={rows.length}
              problems={errorCount + skippedCount}
            />
          )}
          <DataTable
            toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
            mode="local"
            stateKey="features/academic/components/enrollment-import-view:1"
            data={visible}
            columns={columns}
            getRowId={(row) => String(row.row_number)}
          />
          <FormActions>
            {committed ? (
              <>
                {canViewClasses && (
                  <Button asChild variant="secondary">
                    <Link href="/school/classes">{tWorkspace("backToClasses")}</Link>
                  </Button>
                )}
                <Button onClick={reset}>{t("importAnother")}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={reset}>
                  {t("startOver")}
                </Button>
                <Button
                  disabled={errorCount === rows.length}
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
