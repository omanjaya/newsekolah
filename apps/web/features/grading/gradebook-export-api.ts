"use client";

import { ApiError } from "@newsekolah/api-client";

import type { ReportExportOptions } from "../../components/report-export-dialog";
import { getAccessToken } from "../../lib/api/access-token";
import { API_URL } from "../../lib/env";

import { readErrorCode } from "./api";

/** Either a single class or a whole grade level ("angkatan"), for the gradebook export's scope picker. */
export type GradebookExportScope =
  { kind: "class"; classId: string } | { kind: "gradeLevel"; gradeLevelId: string };

/**
 * Encodes one {@link ReportExportDialog}-chosen column as the `columns`
 * query param's `key` or `key:Label` form (docs/05-shared-components.md
 * "Laporan dan ekspor"). Left unencoded here on purpose: `params` below
 * gets exactly one `URLSearchParams` encoding pass, so pre-encoding the
 * label here (as features/reports/api.ts's own encodeColumnChoice does)
 * would double-encode it.
 */
function encodeColumnChoice(choice: { key: string; label?: string }): string {
  return choice.label ? `${choice.key}:${choice.label}` : choice.key;
}

/**
 * Downloads the gradebook export (XLSX or PDF, per options.format) for
 * one class or a whole grade level -- the exact same data GET
 * /v1/grading/gradebook shows, NOT the e-Rapor export (features/grading/
 * api.ts's downloadEraporExport).
 */
export async function downloadGradebookExport(
  scope: GradebookExportScope,
  subjectId: string,
  termId: string | undefined,
  options: ReportExportOptions,
): Promise<void> {
  const token = getAccessToken();
  const params = new URLSearchParams({
    subject_id: subjectId,
    format: options.format,
    title: options.title,
    letterhead: options.showLetterhead ? "true" : "false",
  });
  if (scope.kind === "class") {
    params.set("class_id", scope.classId);
  } else {
    params.set("grade_level_id", scope.gradeLevelId);
  }
  if (termId) params.set("term_id", termId);
  if (options.columns.length > 0) {
    params.set("columns", options.columns.map(encodeColumnChoice).join(","));
  }
  const response = await fetch(`${API_URL}/v1/grading/gradebook/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ApiError({ status: response.status, code, message: code });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `buku-nilai.${options.format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
