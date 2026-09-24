"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import type { ReportExportOptions } from "../../components/report-export-dialog";
import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { reportExportExtension, withReportExportParams } from "../../lib/api/report-export-query";
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

// XLSX/PDF exports: the API returns raw file bytes, so a plain `fetch` is
// used instead of the JSON-typed client (see api.ts's own `downloadPDF`).

/**
 * Runs one of the reportdoc-backed library report exports per the
 * {@link ReportExportDialog}'s chosen format/title/letterhead/columns.
 */
async function downloadReportExport(
  path: string,
  baseParams: URLSearchParams,
  fileNameBase: string,
  options: ReportExportOptions,
): Promise<void> {
  const token = getAccessToken();
  const params = withReportExportParams(baseParams, options);
  const response = await fetch(`${API_URL}${path}?${params.toString()}`, {
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
    link.download = `${fileNameBase}.${reportExportExtension(options)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Renders the catalogue accreditation summary per the
 * {@link ReportExportDialog}'s chosen format/title/letterhead -- no
 * `columns` param, since its two sections (indicators, Dewey-class
 * breakdown) have different column counts and cannot share one end-user
 * column selection (see reportdoc.Section.Columns and the dialog's own
 * `columnsCustomizable={false}` mode this report uses).
 */
export function downloadLibrarySummaryReportXlsx(
  from: string,
  to: string,
  options: ReportExportOptions,
): Promise<void> {
  return downloadReportExport(
    "/v1/library/reports/summary.xlsx",
    new URLSearchParams({ from, to }),
    `laporan-akreditasi-${from}-${to}`,
    options,
  );
}

export function downloadLoansReportXlsx(
  from: string,
  to: string,
  options: ReportExportOptions,
): Promise<void> {
  return downloadReportExport(
    "/v1/library/reports/loans.xlsx",
    new URLSearchParams({ from, to }),
    `laporan-peminjaman-${from}-${to}`,
    options,
  );
}

export function downloadOverdueMembersReportXlsx(options: ReportExportOptions): Promise<void> {
  return downloadReportExport(
    "/v1/library/reports/overdue-members.xlsx",
    new URLSearchParams(),
    "laporan-anggota-terlambat",
    options,
  );
}

export function downloadMostBorrowedReportXlsx(
  from: string,
  to: string,
  options: ReportExportOptions,
): Promise<void> {
  return downloadReportExport(
    "/v1/library/reports/most-borrowed.xlsx",
    new URLSearchParams({ from, to }),
    `laporan-paling-sering-dipinjam-${from}-${to}`,
    options,
  );
}

export function downloadLibraryVisitsReportXlsx(
  from: string,
  to: string,
  options: ReportExportOptions,
): Promise<void> {
  return downloadReportExport(
    "/v1/library/reports/visits.xlsx",
    new URLSearchParams({ from, to }),
    `laporan-kunjungan-${from}-${to}`,
    options,
  );
}

export function downloadLibraryMembersReportXlsx(options: ReportExportOptions): Promise<void> {
  return downloadReportExport(
    "/v1/library/reports/members.xlsx",
    new URLSearchParams(),
    "laporan-anggota",
    options,
  );
}

export function downloadLibraryAccessionRegisterReportXlsx(
  from: string,
  to: string,
  options: ReportExportOptions,
): Promise<void> {
  return downloadReportExport(
    "/v1/library/reports/accession-register.xlsx",
    new URLSearchParams({ from, to }),
    `buku-induk-${from}-${to}`,
    options,
  );
}
