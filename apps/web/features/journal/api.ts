"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ReportExportOptions } from "../../components/report-export-dialog";
import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";
import { useActiveYear } from "../../lib/hooks/use-active-year";

export type Journal = components["schemas"]["Journal"];
export type JournalWriteRequest = components["schemas"]["JournalWriteRequest"];
export type JournalExportFormat = "xlsx" | "docx";

/**
 * My own journals for the active year, or (class_id given, requires
 * `view_journals_all`) every journal for that class -- mirrors
 * apps/mobile's `useJournals` so both clients invalidate the same cache
 * entry after a write.
 */
export function useJournalsQuery(classId?: string, pageIndex = 0, pageSize = 50) {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: [...queryKeys.journals(year.id, classId), pageIndex, pageSize],
    queryFn: () =>
      client.GET("/v1/journals", {
        params: {
          query: {
            academic_year_id: year.id,
            limit: pageSize,
            offset: pageIndex * pageSize,
            ...(classId ? { class_id: classId } : {}),
          },
        },
      }),
    enabled: year.id !== "",
  });
}

export function useJournalQuery(journalId: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.journal(journalId ?? ""),
    queryFn: () =>
      client.GET("/v1/journals/{journalId}", { params: { path: { journalId: journalId ?? "" } } }),
    enabled: journalId !== null,
  });
}

export function useUpsertJournalMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JournalWriteRequest) => client.POST("/v1/journals", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journals"] });
    },
  });
}

export function useDeleteJournalMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (journalId: string) =>
      client.DELETE("/v1/journals/{journalId}", { params: { path: { journalId } } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journals"] });
    },
  });
}

/**
 * Downloads the journal export as an XLSX or DOCX file. Uses a direct
 * `fetch`, same reasoning as `downloadReportExport` in `features/reports`:
 * the shared client always parses the response as JSON, but this endpoint
 * returns a binary file.
 */
export async function downloadJournalExport(
  yearId: string,
  classId: string | undefined,
  format: JournalExportFormat,
): Promise<void> {
  const token = getAccessToken();
  const params = new URLSearchParams({ academic_year_id: yearId, format });
  if (classId) params.set("class_id", classId);
  const response = await fetch(`${API_URL}/v1/journals/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `journal.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Encodes one {@link ReportExportDialog}-chosen column as the `columns`
 * query param's `key` or `key:Label` form (docs/05-shared-components.md
 * "Laporan dan ekspor"). Left unencoded here on purpose: `query` below
 * gets exactly one `URLSearchParams` encoding pass, so pre-encoding the
 * label here (as features/reports/api.ts's own encodeColumnChoice does)
 * would double-encode it.
 */
function encodeColumnChoice(choice: { key: string; label?: string }): string {
  return choice.label ? `${choice.key}:${choice.label}` : choice.key;
}

/**
 * Downloads the journal export as XLSX or PDF (per options.format) via
 * {@link ReportExportDialog}'s onExport -- reportdoc's own customisable
 * letterhead/title/columns. DOCX keeps its own fixed layout and
 * {@link downloadJournalExport} above, unaffected by this dialog.
 */
export async function downloadJournalExportReport(
  yearId: string,
  classId: string | undefined,
  options: ReportExportOptions,
): Promise<void> {
  const token = getAccessToken();
  const params = new URLSearchParams({
    academic_year_id: yearId,
    format: options.format,
    title: options.title,
    letterhead: options.showLetterhead ? "true" : "false",
  });
  if (classId) params.set("class_id", classId);
  if (options.columns.length > 0) {
    params.set("columns", options.columns.map(encodeColumnChoice).join(","));
  }
  const response = await fetch(`${API_URL}/v1/journals/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `jurnal-mengajar.${options.format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
