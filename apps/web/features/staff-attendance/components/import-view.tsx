"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate, type Locale } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  SectionHeader,
  SkeletonList,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "@newsekolah/ui";
import { FileUp, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, ReactElement } from "react";
import { useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useImportStaffAttendanceMutation, useStaffAttendanceRosterQuery } from "../api";
import { type ImportProblem, type ParsedImportRow, parseImportCsv } from "../import-csv";

import { EmployeeCombobox } from "./employee-combobox";

interface Resolved {
  row: ParsedImportRow;
  employeeUserId: string;
  employeeName: string;
}

/** "07.05" (id) or "07:05" (en) from a device's wall-clock "YYYY-MM-DDTHH:MM:SS". */
function wallClock(value: string | undefined, locale: Locale): string {
  if (!value) return "–";
  const time = value.slice(11, 16);
  return locale === "id" ? time.replace(":", ".") : time;
}

/**
 * Loading records off an attendance device, in three visible steps: pick
 * the file, point any code the roster does not recognise at a person, then
 * check every row before saving. The file is read and matched here and
 * shown in full before anything is sent: an import that quietly drops
 * rows leaves people marked absent for days they were at work, so every
 * row is either accounted for or listed as a problem.
 */
export function StaffAttendanceImportView(): ReactElement {
  const t = useTranslations("app.staffAttendance.import");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const roster = useStaffAttendanceRosterQuery();
  const importRecords = useImportStaffAttendanceMutation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  // A device writes whatever staff number its own operator typed into it,
  // and the roster this API returns carries only a name, so a key it does
  // not match has to be pointed at a person by hand. Mapped once per key,
  // not once per row.
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const employees = roster.data?.data ?? [];

  function autoMatch(key: string): string | undefined {
    const needle = key.trim().toLowerCase();
    return employees.find((employee) => employee.name.toLowerCase() === needle)?.id;
  }

  function employeeIdFor(key: string): string | undefined {
    return mapping[key] ?? autoMatch(key);
  }

  const resolved: Resolved[] = rows.flatMap((row) => {
    const id = employeeIdFor(row.employeeKey);
    if (!id) return [];
    const name = employees.find((employee) => employee.id === id)?.name ?? row.employeeKey;
    return [{ row, employeeUserId: id, employeeName: name }];
  });

  const unmappedKeys = [...new Set(rows.map((row) => row.employeeKey))].filter(
    (key) => !employeeIdFor(key),
  );
  const step = fileName === null ? 0 : unmappedKeys.length > 0 ? 1 : 2;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseImportCsv(text);

    setFileName(file.name);
    setRows(parsed.rows);
    setMapping({});
    setProblems(parsed.problems.sort((a, b) => a.line - b.line));
  }

  async function apply() {
    try {
      await importRecords.mutateAsync(
        resolved.map((item) => ({
          employee_user_id: item.employeeUserId,
          date: item.row.date,
          arrival_at: item.row.arrivalAt,
          departure_at: item.row.departureAt,
          notes: item.row.notes,
        })),
      );
      toast.success(t("applied", { count: resolved.length }));
      setRows([]);
      setMapping({});
      setProblems([]);
      setFileName(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <>
      <Stepper
        variant="compact"
        currentIndex={step}
        steps={[
          { id: "file", label: t("steps.file") },
          { id: "match", label: t("steps.match") },
          { id: "review", label: t("steps.review") },
        ]}
      />
      <Card padding="md">
        <CardHeader>
          <CardTitle as="h2">{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <p className="text-body-sm text-fg-muted">{t("columns")}</p>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void onFile(event);
          }}
        />
        <Button
          variant="secondary"
          icon={<FileUp />}
          className="w-full sm:w-fit"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          {fileName ?? t("chooseFile")}
        </Button>
      </Card>

      {roster.isLoading ? (
        <SkeletonList rows={3} leading={false} />
      ) : fileName === null ? (
        <EmptyState icon={<FileUp />} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <>
          {problems.length > 0 && (
            <Alert tone="warning" title={t("problemsTitle", { count: problems.length })}>
              <ul className="flex flex-col gap-1">
                {problems.map((problem) => (
                  <li key={`${problem.line}-${problem.reason}`}>
                    {t("problemLine", {
                      line: problem.line,
                      reason: t(`reasons.${problem.reason}`),
                      value: problem.value,
                    })}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {unmappedKeys.length > 0 && (
            <Card padding="md">
              <CardHeader>
                <CardTitle as="h2">{t("mappingTitle")}</CardTitle>
                <CardDescription>{t("mappingBody")}</CardDescription>
              </CardHeader>
              {unmappedKeys.map((key) => (
                <Field key={key} label={key} orientation="horizontal">
                  <EmployeeCombobox
                    employees={employees}
                    value=""
                    onValueChange={(value) => {
                      setMapping((prev) => ({ ...prev, [key]: value }));
                    }}
                  />
                </Field>
              ))}
            </Card>
          )}

          <section className="flex flex-col gap-3">
            <SectionHeader
              title={t("previewTitle", { count: resolved.length })}
              action={
                <Button
                  size="sm"
                  icon={<Upload />}
                  disabled={resolved.length === 0}
                  loading={importRecords.isPending}
                  onClick={() => {
                    void apply();
                  }}
                >
                  {t("apply", { count: resolved.length })}
                </Button>
              }
            />
            {resolved.length > 0 && (
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnEmployee")}</TableHead>
                    <TableHead>{t("columnDate")}</TableHead>
                    <TableHead className="text-right">{t("columnArrival")}</TableHead>
                    <TableHead className="text-right">{t("columnDeparture")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolved.map((item) => (
                    <TableRow key={`${item.employeeUserId}-${item.row.date}`}>
                      <TableCell>{item.employeeName}</TableCell>
                      <TableCell>
                        {formatDate(`${item.row.date}T12:00:00Z`, { locale, timeZone: "UTC" })}
                      </TableCell>
                      <TableCell className="text-right">
                        {wallClock(item.row.arrivalAt, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {wallClock(item.row.departureAt, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}
    </>
  );
}
