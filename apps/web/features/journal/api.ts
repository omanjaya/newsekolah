"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
export function useJournalsQuery(classId?: string) {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: queryKeys.journals(year.id, classId),
    queryFn: () =>
      client.GET("/v1/journals", {
        params: { query: { academic_year_id: year.id, ...(classId ? { class_id: classId } : {}) } },
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
