import { ApiError, type components } from "@newsekolah/api-client";
import ExcelJS from "exceljs";

import { getAccessToken } from "../../../lib/api/access-token";
import { API_URL } from "../../../lib/env";

export type UserImportRow = components["schemas"]["UserImportRow"];

const IMPORT_DATA_SHEET = "Import";

/**
 * Every column apps/api's ImportTemplate writes
 * (identity/service/import_template.go's importTemplateColumns), in the
 * same order. The header row's cell text is the field name directly: the
 * backend's own comment says the column order is "a sensible, documented
 * convention, not something the backend parses back", so this file is the
 * one place that convention has to hold.
 */
const ROW_FIELDS = [
  "username",
  "email",
  "password",
  "profile_kind",
  "role_slug",
  "nik",
  "name",
  "gender",
  "birth_place",
  "birth_date",
  "religion",
  "address",
  "district",
  "city",
  "phone",
  "blood_type",
  "nis",
  "nisn",
  "entry_year",
  "father_name",
  "mother_name",
  "guardian_name",
  "guardian_phone",
  "parent_occupation",
  "previous_school",
  "nip",
  "nuptk",
  "last_education",
  "employment_status",
  "joined_year",
  "specialization",
  "employee_number",
  "position",
] as const satisfies readonly (keyof UserImportRow)[];

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
      return body.code;
    }
  } catch {
    // Response body was not JSON (or empty); fall through to the generic code.
  }
  return "UNKNOWN";
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Downloads GET /v1/users/import/template and saves it through a
 * throwaway link: the generated client parses every response as JSON, but
 * this endpoint returns a binary workbook (same pattern as
 * features/academic/lib/enrollment-import.ts).
 */
export async function downloadUserImportTemplate(): Promise<void> {
  const response = await fetch(`${API_URL}/v1/users/import/template`, {
    headers: authHeaders(),
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
    link.download = "template-impor-pengguna.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One data cell as the plain string every UserImportRow field expects. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // A date-formatted cell comes back as a JS Date already in local time
    // as Excel displayed it; format as YYYY-MM-DD in UTC fields to avoid a
    // day shifting across a timezone boundary.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    // A formula cell ({formula, result}) or a hyperlink ({text,
    // hyperlink}): use the computed/display text rather than the formula
    // source or the URL. Rich text ({richText: [...]}) is joined back into
    // plain text; the template's own columns never need the formatting.
    if ("result" in value) return cellToString(value.result);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
    }
  }
  return "";
}

export interface ParsedImportFile {
  rows: UserImportRow[];
  /** Set when the file could not be read as a workbook at all, or has no data rows. */
  fileError?: string;
}

/**
 * Reads an admin's filled-in copy of the import template into the JSON
 * rows PreviewUserImport/CommitUserImport take. The API itself only
 * accepts structured rows, never the workbook (identity/service/
 * import_template.go), so this parse step is the only way this screen can
 * work at all: preview shows each row's outcome before anything commits.
 *
 * Column order is read from the header row rather than assumed fixed, so
 * a reordered (but not renamed) template column still lands on the right
 * field. An unrecognized header is ignored rather than rejected, in case
 * an admin left a stray note column in the sheet.
 */
export async function parseUserImportFile(file: File): Promise<ParsedImportFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
  } catch {
    return { rows: [], fileError: "unreadable" };
  }

  const worksheet = workbook.getWorksheet(IMPORT_DATA_SHEET) ?? workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    return { rows: [], fileError: worksheet ? "empty" : "no-sheet" };
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value);
  });
  const knownFieldSet = new Set<string>(ROW_FIELDS);

  const rows: UserImportRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const cells: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (header && knownFieldSet.has(header)) {
        cells[header] = cellToString(cell.value);
      }
    });
    const isBlankRow = Object.values(cells).every((v) => v === "");
    if (isBlankRow) return;

    const importRow: UserImportRow = {
      row_number: rowNumber, // The actual Excel row, so an error message can point back at the sheet.
      name: cells.name ?? "",
      profile_kind: (cells.profile_kind ?? "") as UserImportRow["profile_kind"],
      role_slug: cells.role_slug ?? "",
    };
    for (const f of ROW_FIELDS) {
      if (f === "name" || f === "profile_kind" || f === "role_slug") continue;
      const value = cells[f];
      if (value) importRow[f] = value;
    }
    rows.push(importRow);
  });

  if (rows.length === 0) {
    return { rows: [], fileError: "empty" };
  }
  return { rows };
}
