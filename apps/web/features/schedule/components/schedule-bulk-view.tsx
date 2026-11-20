"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DatePicker,
  EmptyState,
  Field,
  FileDropzone,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { Download, FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import {
  useClassesQuery,
  useLookup,
  usePeriodsQuery,
  useSubjectsQuery,
  useTeacherRosterQuery,
} from "../../reference/api";
import { useBulkImportSchedulesMutation, useScheduleYearQuery } from "../api";
import { parseBulkImportCsv, type BulkImportRow } from "../csv-import";
import { useNamedConflict } from "../use-named-conflict";
import { defaultEffectiveFrom } from "../week";

import { ClearSchedulesSection } from "./clear-schedules-section";

/** The sheet's columns, in order: shown as chips and written into the template. */
const CSV_COLUMNS = [
  "class",
  "subject",
  "teacher",
  "day",
  "start_period",
  "end_period",
  "notes",
] as const;

/** Saves an empty sheet with the right header, so nobody types the columns by hand. */
function downloadTemplate() {
  const blob = new Blob([`${CSV_COLUMNS.join(",")}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "templat-jadwal.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Bulk timetable operations, under the timetable's breadcrumb: one card
 * to load a CSV (the template, the columns as chips, a file or a paste),
 * one card to preview every line before the all-or-nothing import, and the
 * danger zone that clears the year's timetable kept apart at the end.
 */
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
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);
  const yearSpan = useScheduleYearQuery(year.id, canManage);
  const yearStart = yearSpan.data?.starts_on;
  const yearEnd = yearSpan.data?.ends_on;
  // One "Berlaku mulai" for the whole batch: the imported lessons start on
  // it (each on its own weekday's first date from it). Before the year
  // starts that is the year's first day; mid-year it is today, so earlier
  // weeks are not given lessons nobody recorded attendance for.
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  const effectiveFrom = pickedFrom ?? defaultEffectiveFrom({ today, yearStart, yearEnd });

  const [csvText, setCsvText] = useState("");
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  // Name matching needs the teacher roster, but only once a sheet is loaded.
  const teachers = useTeacherRosterQuery(csvText.trim() !== "");
  const periods = usePeriodsQuery();
  const bulkImport = useBulkImportSchedulesMutation();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const namedConflict = useNamedConflict();

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

  function handleFile(file: File) {
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
    bulkImport.mutate(
      resolvedRows.map((row) => ({ ...row, effective_from: effectiveFrom })),
      {
        onSuccess: (result) => {
          toast.success(t("importSection.applied", { count: result.data.length }));
          setCsvText("");
          setFileName(null);
        },
        onError: (error) => {
          void namedConflict(
            error,
            { classMap, subjectMap, teacherMap: new Map(), periods: periods.data?.data ?? [] },
            tSchedule,
          ).then((named) => {
            setImportError(
              named ??
                (error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN")),
            );
          });
        },
      },
    );
  }

  return (
    <AppPage variant="narrow" title={t("title")}>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("importSection.title")}</CardTitle>
          <CardDescription>{t("importSection.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="flex flex-col gap-2">
            <span className="text-label text-fg">{t("importSection.columnsLabel")}</span>
            <ul className="flex flex-wrap gap-1.5" aria-label={t("importSection.columnsLabel")}>
              {CSV_COLUMNS.map((column) => (
                <li key={column}>
                  <Badge tone="neutral" className="font-mono">
                    {column}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <FileDropzone
              accept=".csv,text/csv"
              fileName={fileName}
              chooseLabel={t("importSection.uploadLabel")}
              disabled={!canManage}
              onFile={handleFile}
            />
            <Button variant="link" icon={<Download />} onClick={downloadTemplate} className="w-fit">
              {t("importSection.template")}
            </Button>
          </div>

          <Field
            label={tSchedule("form.effectiveFrom")}
            required
            hint={t("importSection.effectiveFromHint")}
          >
            <DatePicker
              value={effectiveFrom}
              onChange={(next) => {
                if (next) setPickedFrom(next);
              }}
              min={yearStart}
              max={yearEnd}
              today={today}
              clearable={false}
              required
              disabled={!canManage}
            />
          </Field>

          <Field label={t("importSection.textareaLabel")}>
            <Textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setImportError(null);
              }}
              rows={6}
              disabled={!canManage}
              className="font-mono text-caption font-normal"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          action={
            canManage &&
            rows.length > 0 && (
              <Button
                disabled={resolvedRows.length === 0 || invalidCount > 0}
                loading={bulkImport.isPending}
                onClick={handleApply}
              >
                {t("importSection.apply", { count: resolvedRows.length })}
              </Button>
            )
          }
        >
          <CardTitle as="h2">{t("importSection.previewTitle")}</CardTitle>
          {rows.length > 0 && (
            <CardDescription>
              {t("importSection.previewSummary", {
                valid: resolvedRows.length,
                invalid: invalidCount,
              })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {importError && (
            <Alert variant="danger" title={t("importSection.applyErrorTitle")}>
              {importError}
            </Alert>
          )}
          {rows.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<FileSpreadsheet />}
              title={t("importSection.empty")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t("importSection.columnLine")}</TableHead>
                  <TableHead>{t("importSection.columnStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="tabular-nums">{row.line}</TableCell>
                    <TableCell>
                      {row.resolved ? (
                        <Badge tone="success" size="sm" dot>
                          {t("importSection.statusValid")}
                        </Badge>
                      ) : (
                        <span className="text-body-sm text-danger">
                          {t("importSection.statusInvalid", { columns: row.errors.join(", ") })}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && <ClearSchedulesSection academicYearId={year.id} yearLabel={year.label} />}
    </AppPage>
  );
}
