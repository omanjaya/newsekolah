"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  FileDropzone,
  Stepper,
  useToast,
} from "@newsekolah/ui";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
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
} from "../import-fields";
import { parseImportFile } from "../import-lib";

import { ImportMappingStep } from "./import-mapping-step";
import { ImportPreviewTable } from "./import-preview-table";
import { LibraryWorkspaceNav, useLibraryShortcuts } from "./library-workspace-nav";

type Step = "upload" | "mapping" | "preview" | "result";

/**
 * Importing a collection from the XLSX template, as a numbered wizard
 * (docs/07-ui-ux.md "Wizard"): upload, map the columns, review every row,
 * then the result. The page keeps the catalogue tabs under its header.
 */
export function ImportView(): ReactElement {
  const t = useTranslations("app.library.import");
  const shortcuts = useLibraryShortcuts(["catalogueSettings"]);
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
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
  }

  // A file that cannot be read is said under the drop zone; a later step's
  // failure (preview, commit) above the step it stopped.
  const uploadError = step === "upload" && error ? error : undefined;

  return (
    <AppPage nav={<LibraryWorkspaceNav area="catalogue" />} secondaryActions={shortcuts}>
      <Stepper steps={steps} currentIndex={Math.max(currentIndex, 0)} variant="compact" />

      {error && !uploadError && <Alert tone="danger" title={error} />}

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("uploadLabel")}</CardTitle>
            <CardDescription>{t("uploadDescription")}</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4 px-5 pb-5">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download />}
              className="self-start"
              onClick={() => {
                void downloadLibraryImportTemplate();
              }}
            >
              {t("downloadTemplate")}
            </Button>

            {/* The template can be dropped as well as picked; a file that
                cannot be read or has no rows is said under the zone. */}
            <FileDropzone
              accept=".xlsx"
              fileName={fileName}
              icon={<FileSpreadsheet />}
              chooseLabel={t("pickFile")}
              replaceLabel={t("pickAnother")}
              title={t("pickHint")}
              hint={t("formatHint")}
              error={uploadError}
              rejectMessage={t("parseError")}
              onFile={(file) => {
                void handleFile(file);
              }}
            />
          </div>
        </Card>
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
        <Alert
          tone="success"
          title={t("committed")}
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<Upload />}
              onClick={() => {
                resetAll();
              }}
            >
              {t("importAnother")}
            </Button>
          }
        >
          {t("resultSummary", {
            titles: commitResult.created_titles,
            copies: commitResult.created_copies,
          })}
        </Alert>
      )}
    </AppPage>
  );
}
