"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Field,
  Progress,
  Select,
  Stepper,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, CheckCircle2, FileUp, Layers, Upload } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { ImportFileField } from "../../school/components/import-layout";
import {
  type DapodikImportReport,
  type DapodikImportRow,
  type LevelTemplateSummaryKey,
  useApplyFullLevelTemplateMutation,
  useLevelTemplatesQuery,
} from "../api";
import { uploadDapodikCsv } from "../lib/dapodik-upload";

type WizardStep = "template" | "upload" | "review" | "done";
const STEP_ORDER: WizardStep[] = ["template", "upload", "review", "done"];

/**
 * The steps kept in the URL, so a reload lands where the admin left off.
 * "later" is the upload step skipped: the import stays one link away.
 * Review and done hold the uploaded file and its report, which a reload
 * cannot bring back, so they live in component state only.
 */
type UrlStep = "template" | "upload" | "later";
const URL_STEPS: readonly UrlStep[] = ["template", "upload", "later"];

/**
 * The onboarding wizard: pick a level template and apply it, upload a
 * Dapodik student-export CSV, review the dry-run report, then commit it.
 * Every step can be skipped and revisited (docs/07-ui-ux.md, onboarding
 * sekolah). Each step's own mutation invalidates the setup checklist on
 * success, so the checklist below this card (SetupView renders both)
 * reflects progress without the wizard needing to know its shape.
 *
 * `templateDone` (the checklist's grade levels are in place) starts the
 * wizard at the upload step, since the template has already been applied.
 */
export function OnboardingWizard({
  templateDone = false,
}: {
  templateDone?: boolean;
}): ReactElement {
  const t = useTranslations("app.onboarding.wizard");
  const locale = useLocale();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [urlStep, setUrlStep] = useUrlState<UrlStep>(
    "wizard",
    URL_STEPS,
    templateDone ? "upload" : "template",
  );
  const [phase, setPhase] = useState<"review" | "done" | null>(null);
  const step: WizardStep | "later" = phase ?? urlStep;
  const setStep = (next: WizardStep | "later") => {
    if (next === "review" || next === "done") {
      setPhase(next);
      return;
    }
    setPhase(null);
    setUrlStep(next);
  };
  const [file, setFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [report, setReport] = useState<DapodikImportReport | null>(null);
  const [committedCount, setCommittedCount] = useState(0);

  const templates = useLevelTemplatesQuery();
  const applyTemplate = useApplyFullLevelTemplateMutation();
  const [templateKey, setTemplateKey] = useState<LevelTemplateSummaryKey | "">("");

  async function handleApplyTemplate() {
    if (!templateKey) return;
    try {
      await applyTemplate.mutateAsync(templateKey);
      toast.success(t("templateApplied"));
      setStep("upload");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  async function handlePreview() {
    if (!file) return;
    setIsUploading(true);
    setUploadPercent(0);
    try {
      const result = await uploadDapodikCsv<DapodikImportReport>(
        "/v1/tenant/onboarding/dapodik/preview",
        file,
        locale,
        setUploadPercent,
      );
      setReport(result);
      setStep("review");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setIsUploading(true);
    setUploadPercent(0);
    try {
      const result = await uploadDapodikCsv<DapodikImportReport>(
        "/v1/tenant/onboarding/dapodik/commit",
        file,
        locale,
        setUploadPercent,
      );
      setReport(result);
      setCommittedCount(result.data.filter((row) => row.action !== "error").length);
      setStep("done");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setIsUploading(false);
    }
  }

  const columns = useDapodikColumns();

  return (
    <Card padding="md" className="gap-4">
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>

      <Stepper
        variant="compact"
        currentIndex={step === "later" ? STEP_ORDER.indexOf("done") : STEP_ORDER.indexOf(step)}
        steps={STEP_ORDER.map((key) => ({ id: key, label: t(`steps.${key}`) }))}
      />

      {step === "template" && (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-fg-muted">{t("templateBody")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("templateLabel")}>
              <Select
                options={(templates.data?.data ?? []).map((tpl) => ({
                  value: tpl.key,
                  label: tpl.name,
                }))}
                value={templateKey}
                onValueChange={(value) => {
                  setTemplateKey(value as LevelTemplateSummaryKey);
                }}
                placeholder={t("templatePick")}
                disabled={templates.isLoading}
                className="w-56"
              />
            </Field>
            <Button
              size="sm"
              icon={<Layers />}
              disabled={!templateKey}
              loading={applyTemplate.isPending}
              onClick={() => {
                void handleApplyTemplate();
              }}
            >
              {t("templateApply")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStep("upload");
              }}
            >
              {t("skip")}
            </Button>
          </div>
        </div>
      )}

      {step === "upload" && (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-fg-muted">{t("uploadBody")}</p>
          <ImportFileField
            label={t("uploadLabel")}
            accept=".csv,text/csv"
            fileName={file?.name}
            onFile={setFile}
          />
          {isUploading && (
            <Progress value={uploadPercent} label={t("uploading", { percent: uploadPercent })} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowLeft />}
              disabled={isUploading}
              onClick={() => {
                setStep("template");
              }}
            >
              {t("back")}
            </Button>
            <Button
              size="sm"
              icon={<Upload />}
              disabled={!file}
              loading={isUploading}
              onClick={() => {
                void handlePreview();
              }}
            >
              {t("previewAction")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isUploading}
              onClick={() => {
                setStep("later");
              }}
            >
              {t("skip")}
            </Button>
          </div>
        </div>
      )}

      {step === "later" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body-sm text-fg-muted">{t("laterBody")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowLeft />}
              onClick={() => {
                setStep("upload");
              }}
            >
              {t("laterBack")}
            </Button>
            <Button asChild size="sm" variant="ghost" icon={<FileUp />}>
              <Link href="/academic/enrollment-import">{t("laterImport")}</Link>
            </Button>
          </div>
        </div>
      )}

      {step === "review" && report && (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-fg-muted">
            {t("reviewSummary", {
              create: report.data.filter((r) => r.action === "create").length,
              update: report.data.filter((r) => r.action === "update").length,
              error: report.data.filter((r) => r.action === "error").length,
            })}
          </p>
          <DataTable
            stateKey="features/onboarding/components/onboarding-wizard:1"
            mode="local"
            data={report.data}
            columns={columns}
            rowCount={report.data.length}
            pagination={{ pageIndex: 0, pageSize: 20 }}
            onPaginationChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            globalFilter=""
            getRowId={(row) => String(row.row_number)}
            emptyState={
              <EmptyState icon={<FileUp aria-hidden="true" />} title={t("reviewEmpty")} />
            }
          />
          {isUploading && (
            <Progress value={uploadPercent} label={t("uploading", { percent: uploadPercent })} />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setStep("upload");
              }}
            >
              {t("reviewBack")}
            </Button>
            <Button
              size="sm"
              loading={isUploading}
              disabled={report.data.every((r) => r.action === "error")}
              onClick={() => {
                void handleCommit();
              }}
            >
              {t("commitAction")}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 text-fg">
            <CheckCircle2 className="size-5 text-accent" aria-hidden="true" />
            <p className="text-body font-medium">{t("doneTitle", { count: committedCount })}</p>
          </div>
          <p className="text-body-sm text-fg-muted">{t("doneBody")}</p>
        </div>
      )}
    </Card>
  );
}

function useDapodikColumns(): ColumnDef<DapodikImportRow>[] {
  const t = useTranslations("app.onboarding.wizard");
  return useMemo<ColumnDef<DapodikImportRow>[]>(
    () => [
      { accessorKey: "row_number", header: t("columnRow"), enableSorting: false },
      { accessorKey: "name", header: t("columnName"), enableSorting: false },
      { accessorKey: "nisn", header: t("columnNisn"), enableSorting: false },
      { accessorKey: "class_name", header: t("columnClass"), enableSorting: false },
      {
        id: "action",
        header: t("columnAction"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={row.original.action === "error" ? "danger" : "success"}>
            {t(`action.${row.original.action}`)}
          </Badge>
        ),
      },
      {
        id: "errors",
        header: t("columnErrors"),
        enableSorting: false,
        cell: ({ row }) => row.original.errors?.join(", ") ?? "",
      },
    ],
    [t],
  );
}
