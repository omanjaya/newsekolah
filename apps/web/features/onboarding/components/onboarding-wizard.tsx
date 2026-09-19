"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Progress,
  Select,
  Stepper,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, FileUp, Layers, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
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
 * The onboarding wizard: pick a level template and apply it, upload a
 * Dapodik student-export CSV, review the dry-run report, then commit it.
 * Each step's own mutation invalidates the setup checklist on success, so
 * the checklist below this card (SetupView renders both) reflects progress
 * without the wizard needing to know its shape.
 */
export function OnboardingWizard(): ReactElement {
  const t = useTranslations("app.onboarding.wizard");
  const locale = useLocale();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [step, setStep] = useState<WizardStep>("template");
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
    <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("body")}</p>
      </div>

      <Stepper
        currentIndex={STEP_ORDER.indexOf(step)}
        steps={STEP_ORDER.map((key) => ({ id: key, label: t(`steps.${key}`) }))}
      />

      {step === "template" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-fg-muted">{t("templateBody")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("templateLabel")}</span>
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
            </label>
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
          <p className="text-[13px] text-fg-muted">{t("uploadBody")}</p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label={t("uploadLabel")}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
            }}
            className="text-[13px] text-fg file:mr-3 file:rounded-xs file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
          />
          {isUploading && (
            <Progress value={uploadPercent} label={t("uploading", { percent: uploadPercent })} />
          )}
          <div>
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
          </div>
        </div>
      )}

      {step === "review" && report && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-fg-muted">
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
            <p className="text-[14px] font-medium">{t("doneTitle", { count: committedCount })}</p>
          </div>
          <p className="text-[13px] text-fg-muted">{t("doneBody")}</p>
        </div>
      )}
    </section>
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
          <Badge variant={row.original.action === "error" ? "neutral" : "accent"}>
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
