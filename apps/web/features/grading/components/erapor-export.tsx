"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  List,
  ListRow,
  SectionHeader,
  Select,
  SkeletonList,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "@newsekolah/ui";
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
        <Field label={t("pickTerm")} className="w-full md:w-auto">
          <Select
            options={termOptions}
            value={termId}
            onValueChange={setTermId}
            className="w-full md:w-56"
          />
        </Field>
        <Field label={t("formatLabel")}>
          <Select
            options={formatOptions}
            value={format}
            onValueChange={(value) => {
              setFormat(value as EraporFormat);
            }}
            className="w-full md:w-40"
          />
        </Field>
        <Field label={t("pickClass")} className="w-full md:w-auto">
          <Select
            options={classOptions}
            value={effectiveClassId}
            onValueChange={setClassId}
            className="w-full md:w-56"
          />
        </Field>
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
        <SkeletonList rows={4} leading={false} />
      ) : preview.isError ? (
        <Alert
          variant="danger"
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
          <p className="text-body-sm text-fg-muted">
            {t("summary", { rows: rows.length, skipped: skipped.length })}
          </p>

          <section className="flex flex-col gap-3">
            <SectionHeader as="h3" title={t("rowsTitle")} count={rows.length} />
            {rows.length === 0 ? (
              <EmptyState variant="compact" title={t("rowsEmpty")} />
            ) : (
              <div className="flex flex-col gap-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("rowsColumnNisn")}</TableHead>
                      <TableHead>{t("rowsColumnSubject")}</TableHead>
                      <TableHead>{t("rowsColumnScore")}</TableHead>
                      <TableHead>{t("rowsColumnPredicate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, MAX_ROWS_SHOWN).map((row) => (
                      <TableRow key={`${row.nisn}-${row.subject_code}`}>
                        <TableCell>{row.nisn}</TableCell>
                        <TableCell>{row.subject_code}</TableCell>
                        <TableCell>{row.score}</TableCell>
                        <TableCell>{row.predicate}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > MAX_ROWS_SHOWN && (
                  <p className="text-body-sm text-fg-muted">
                    {t("rowsMore", { count: rows.length - MAX_ROWS_SHOWN })}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader as="h3" title={t("skippedTitle")} count={skipped.length} />
            {skipped.length === 0 ? (
              <EmptyState variant="compact" title={t("skippedEmpty")} />
            ) : (
              <List framed dense>
                {skipped.map((skip) => (
                  <ListRow
                    key={`${skip.student_name}-${skip.subject_name}-${skip.reason}`}
                    title={t("skippedRow", {
                      student: skip.student_name,
                      subject: skip.subject_name,
                    })}
                    meta={t(`reason.${skip.reason}`)}
                  />
                ))}
              </List>
            )}
          </section>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h3">{t("legacyTitle")}</CardTitle>
          <CardDescription>{t("legacyHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 pt-0">
          <Field label={t("legacySubject")} className="w-full md:w-auto">
            <Select
              options={subjectOptions}
              value={legacySubjectId}
              onValueChange={setLegacySubjectId}
              className="w-full md:w-56"
            />
          </Field>
          <Button
            variant="secondary"
            icon={<Download />}
            loading={legacyDownloading}
            disabled={!effectiveClassId || !legacySubjectId}
            onClick={() => void downloadLegacy()}
          >
            {t("legacyDownload")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
