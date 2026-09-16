"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type LibraryImportPreview = components["schemas"]["LibraryImportPreview"];
export type LibraryImportPreviewRow = components["schemas"]["LibraryImportPreviewRow"];
export type LibraryImportCommitResult = components["schemas"]["LibraryImportCommitResult"];
export type LibraryImportRequest = components["schemas"]["LibraryImportRequest"];

export function useLibraryImportPreviewMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: LibraryImportRequest) => client.POST("/v1/library/import/preview", { body }),
  });
}

export function useLibraryImportCommitMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryImportRequest) => client.POST("/v1/library/import/commit", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library", "titles"] });
    },
  });
}

/** Downloads the XLSX template; the API returns raw bytes, so a plain `fetch` is used. */
export async function downloadLibraryImportTemplate(): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}/v1/library/import/template.xlsx`, {
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
    link.download = "template-import-koleksi.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
