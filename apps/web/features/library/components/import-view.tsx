"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, PageHeader, Stepper, useToast } from "@newsekolah/ui";
import { Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  downloadLibraryImportTemplate,
  useLibraryImportCommitMutation,
  useLibraryImportPreviewMutation,
} from "../import-api";
import type { LibraryImportCommitResult, LibraryImportPreview } from "../import-api";
import {
  type ImportField,
  type ImportRowPayload,
  buildImportPayload,
  guessImportMapping,
  parseImportFile,
} from "../import-lib";

import { ImportMappingStep } from "./import-mapping-step";
import { ImportPreviewTable } from "./import-preview-table";

type Step = "upload" | "mapping" | "preview" | "result";

export function ImportView(): ReactElement {
  const t = useTranslations("app.library.import");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preview = useLibraryImportPreviewMutation();
  const commit = useLibraryImportCommitMutation();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({});
  const [payloadRows, setPayloadRows] = useState<ImportRowPayload[]>([]);
  const [previewResult, setPreviewResult] = useState<LibraryImportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<LibraryImportCommitResult | null>(null);
  const [error, setError] = useState("");

  const steps = [
    { id: "upload", label: t("steps.upload") },
    { id: "mapping", label: t("steps.mapping") },
    { id: "preview", label: t("steps.preview") },
    { id: "result", label: t("steps.result") },
  ];
  const currentIndex = steps.findIndex((s) => s.id === step);

  async function handleFile(file: File) {
    setError("");
    try {
      const parsed = await parseImportFile(file);
      if (parsed.rows.length === 0) {
        setError(t("emptyFile"));
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setParsedRows(parsed.rows);
      setMapping(guessImportMapping(parsed.headers));
      setStep("mapping");
    } catch {
      setError(t("parseError"));
    }
  }

  async function runPreview() {
    setError("");
    const { rows, mapping: cleanMapping } = buildImportPayload(parsedRows, mapping);
    setPayloadRows(rows);
    try {
      const result = await preview.mutateAsync({ rows, mapping: cleanMapping });
      setPreviewResult(result);
      setStep("preview");
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  async function runCommit() {
    if (!previewResult) return;
    setError("");
    const errorRowNumbers = new Set(
      previewResult.rows.filter((r) => r.status === "error").map((r) => r.row_number),
    );
    const rowsToCommit = payloadRows.filter((row) => !errorRowNumbers.has(row.row_number));
    const { mapping: cleanMapping } = buildImportPayload(parsedRows, mapping);
    try {
      const result = await commit.mutateAsync({ rows: rowsToCommit, mapping: cleanMapping });
      setCommitResult(result);
      setStep("result");
      toast.success(t("committed"));
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  function resetAll() {
    setStep("upload");
    setFileName("");
    setParsedRows([]);
    setHeaders([]);
    setMapping({});
    setPayloadRows([]);
    setPreviewResult(null);
    setCommitResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Stepper steps={steps} currentIndex={Math.max(currentIndex, 0)} />

      {error && <Alert variant="warning" title={error} />}

      {step === "upload" && (
        <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-6">
          <p className="text-[13px] text-fg-muted">{t("uploadDescription")}</p>
          <Button
            type="button"
            variant="secondary"
            icon={<Download />}
            onClick={() => {
              void downloadLibraryImportTemplate();
            }}
          >
            {t("downloadTemplate")}
          </Button>
          <label className="flex flex-col gap-2 text-[13px]">
            <span className="font-medium text-fg">{t("uploadLabel")}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="rounded-xs border border-border bg-bg p-2 text-[13px] file:mr-3 file:rounded-xs file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            {fileName && (
              <span className="text-fg-muted">{t("selectedFile", { name: fileName })}</span>
            )}
          </label>
        </div>
      )}

      {step === "mapping" && (
        <ImportMappingStep
          headers={headers}
          mapping={mapping}
          onMappingChange={setMapping}
          onBack={() => {
            setStep("upload");
          }}
          onContinue={() => {
            void runPreview();
          }}
        />
      )}

      {step === "preview" && previewResult && (
        <ImportPreviewTable
          preview={previewResult}
          onBack={() => {
            setStep("mapping");
          }}
          onCommit={() => {
            void runCommit();
          }}
          committing={commit.isPending}
        />
      )}

      {step === "result" && commitResult && (
        <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-6">
          <p className="text-[14px] text-fg">
            {t("resultSummary", {
              titles: commitResult.created_titles,
              copies: commitResult.created_copies,
            })}
          </p>
          <div className="flex justify-end border-t border-border pt-4">
            <Button
              type="button"
              icon={<Upload />}
              onClick={() => {
                resetAll();
              }}
            >
              {t("importAnother")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
