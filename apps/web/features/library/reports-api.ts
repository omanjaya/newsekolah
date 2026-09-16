"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type LibraryCatalogueSummary = components["schemas"]["LibraryCatalogueSummary"];
export type LibraryVisitsReport = components["schemas"]["LibraryVisitsReport"];
export type LibraryMembersReport = components["schemas"]["LibraryMembersReport"];
export type LibraryCopy = components["schemas"]["LibraryCopy"];

export function useLibraryCatalogueSummaryReportQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "reports", "summary", from, to],
    queryFn: () => client.GET("/v1/library/reports/summary", { params: { query: { from, to } } }),
    enabled: Boolean(from && to),
  });
}

export function useLibraryVisitsReportQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "reports", "visits", from, to],
    queryFn: () => client.GET("/v1/library/reports/visits", { params: { query: { from, to } } }),
    enabled: Boolean(from && to),
  });
}

export function useLibraryMembersReportQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "reports", "members"],
    queryFn: () => client.GET("/v1/library/reports/members"),
  });
}

export function useLibraryAccessionRegisterReportQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "reports", "accession-register", from, to],
    queryFn: () =>
      client.GET("/v1/library/reports/accession-register", { params: { query: { from, to } } }),
    enabled: Boolean(from && to),
  });
}

// XLSX exports: the API returns raw spreadsheet bytes, so a plain `fetch`
// is used instead of the JSON-typed client (see api.ts's own `downloadPDF`).

async function downloadFile(path: string, fileName: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
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
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadLibrarySummaryReportXlsx(from: string, to: string): Promise<void> {
  return downloadFile(
    `/v1/library/reports/summary.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    `laporan-akreditasi-${from}-${to}.xlsx`,
  );
}

export function downloadLibraryVisitsReportXlsx(from: string, to: string): Promise<void> {
  return downloadFile(
    `/v1/library/reports/visits.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    `laporan-kunjungan-${from}-${to}.xlsx`,
  );
}

export function downloadLibraryMembersReportXlsx(): Promise<void> {
  return downloadFile("/v1/library/reports/members.xlsx", "laporan-anggota.xlsx");
}

export function downloadLibraryAccessionRegisterReportXlsx(
  from: string,
  to: string,
): Promise<void> {
  return downloadFile(
    `/v1/library/reports/accession-register.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    `buku-induk-${from}-${to}.xlsx`,
  );
}
