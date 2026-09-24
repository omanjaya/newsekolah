import type { ReportExportOptions } from "../../components/report-export-dialog";

/**
 * Encodes one chosen column as the `columns` query param's `key` or
 * `key:Label` form (see docs/05-shared-components.md "Laporan dan
 * ekspor"). The label half is URL-encoded on its own so a comma or colon
 * in a user-typed label cannot be mistaken for the list/key separators.
 * Mirrors `features/reports/api.ts`'s own `encodeColumnChoice` -- kept as
 * a small shared helper here since every {@link ReportExportDialog}
 * integration outside the report centre needs the exact same encoding.
 */
function encodeColumnChoice(choice: { key: string; label?: string }): string {
  return choice.label ? `${choice.key}:${encodeURIComponent(choice.label)}` : choice.key;
}

/**
 * Adds the shared format/title/letterhead/columns query params (the
 * reportdoc contract every migrated export endpoint decodes, see
 * apps/api/internal/platform/reportdoc's package comment) onto `params`,
 * the endpoint's own scope params (month, employeeId, date range, ...).
 * Mutates and returns `params` so a caller can build it inline.
 */
export function withReportExportParams(
  params: URLSearchParams,
  options: ReportExportOptions,
): URLSearchParams {
  params.set("format", options.format);
  params.set("title", options.title);
  params.set("letterhead", options.showLetterhead ? "true" : "false");
  if (options.columns.length > 0) {
    params.set("columns", options.columns.map(encodeColumnChoice).join(","));
  }
  return params;
}

/** The file extension a chosen export format downloads as. */
export function reportExportExtension(options: ReportExportOptions): "xlsx" | "pdf" {
  return options.format === "pdf" ? "pdf" : "xlsx";
}
