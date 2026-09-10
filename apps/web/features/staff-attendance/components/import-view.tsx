"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, EmptyState, Select, Skeleton, useToast } from "@newsekolah/ui";
import { FileUp, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useImportStaffAttendanceMutation, useStaffAttendanceRosterQuery } from "../api";
import { type ImportProblem, type ParsedImportRow, parseImportCsv } from "../import-csv";

interface Resolved {
  row: ParsedImportRow;
  employeeUserId: string;
  employeeName: string;
}

/**
 * Loading a day's records off an attendance device. The file is read and
 * matched here, then shown in full before anything is sent: an import
 * that quietly drops rows leaves people marked absent for days they were
 * at work, so every row is either accounted for or listed as a problem.
 */
export function StaffAttendanceImportView(): ReactElement {
  const t = useTranslations("app.staffAttendance.import");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const roster = useStaffAttendanceRosterQuery();
  const importRecords = useImportStaffAttendanceMutation();
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
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <div>
          <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
          <p className="text-[13px] text-fg-muted">{t("body")}</p>
        </div>
        <p className="text-[12px] text-fg-muted">{t("columns")}</p>
        <label
          htmlFor="staff-attendance-import-file"
          className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-sm border border-border px-3 text-[13px] text-fg hover:bg-bg md:h-8"
        >
          <FileUp className="size-4" aria-hidden="true" />
          {fileName ?? t("chooseFile")}
        </label>
        <input
          id="staff-attendance-import-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(event) => {
            void onFile(event);
          }}
        />
      </section>

      {roster.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : fileName === null ? (
        <EmptyState
          icon={<FileUp aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <>
          {problems.length > 0 && (
            <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-fg-muted" aria-hidden="true" />
                <h3 className="text-[13px] font-medium text-fg">
                  {t("problemsTitle", { count: problems.length })}
                </h3>
              </div>
              <ul className="flex flex-col gap-1 text-[12px] text-fg-muted">
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
            </section>
          )}

          {unmappedKeys.length > 0 && (
            <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
              <div>
                <h3 className="text-[13px] font-medium text-fg">{t("mappingTitle")}</h3>
                <p className="text-[12px] text-fg-muted">{t("mappingBody")}</p>
              </div>
              <div className="flex flex-col gap-2">
                {unmappedKeys.map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-[13px] text-fg">{key}</span>
                    <Select
                      aria-label={t("mappingSelect", { key })}
                      value=""
                      options={[
                        { value: "", label: t("mappingPlaceholder") },
                        ...employees.map((employee) => ({
                          value: employee.id,
                          label: employee.name,
                        })),
                      ]}
                      onValueChange={(value) => {
                        setMapping((prev) => ({ ...prev, [key]: value }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
            <h3 className="text-[13px] font-medium text-fg">
              {t("previewTitle", { count: resolved.length })}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="text-left text-fg-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t("columnEmployee")}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t("columnDate")}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t("columnArrival")}
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      {t("columnDeparture")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resolved.map((item) => (
                    <tr key={`${item.employeeUserId}-${item.row.date}`}>
                      <td className="py-2 pr-4 text-fg">{item.employeeName}</td>
                      <td className="py-2 pr-4 text-fg-muted">{item.row.date}</td>
                      <td className="py-2 pr-4 text-fg-muted">
                        {item.row.arrivalAt?.slice(11, 16) ?? "-"}
                      </td>
                      <td className="py-2 text-fg-muted">
                        {item.row.departureAt?.slice(11, 16) ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              className="w-fit"
              disabled={resolved.length === 0 || importRecords.isPending}
              onClick={() => {
                void apply();
              }}
            >
              {t("apply", { count: resolved.length })}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
