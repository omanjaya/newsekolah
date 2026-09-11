import { ApiError, type components } from "@newsekolah/api-client";

import { getAccessToken } from "../../../lib/api/access-token";
import { API_URL } from "../../../lib/env";

export type ImportRowResult = components["schemas"]["ImportRowResult"];

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
 * Downloads the class-assignment import template and saves it through a
 * throwaway link, the same pattern `features/reports/api.ts` uses for its
 * XLSX export: the generated client parses every response as JSON, but this
 * endpoint returns a binary workbook. academicYearId picks which year's
 * unassigned students and classes the template is prefilled with.
 */
export async function downloadEnrollmentImportTemplate(academicYearId: string): Promise<void> {
  const query = new URLSearchParams({ academic_year_id: academicYearId }).toString();
  const response = await fetch(`${API_URL}/v1/academic/enrollments/import/template?${query}`, {
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
    link.download = "penempatan-kelas.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Sends the uploaded workbook to either the preview or the commit endpoint.
 * Both expect the raw XLSX bytes as the body (not multipart form data), so
 * this goes around the generated client the same way
 * `features/onboarding/lib/dapodik-upload.ts` does for the Dapodik CSV.
 */
export async function uploadEnrollmentWorkbook(
  step: "preview" | "commit",
  academicYearId: string,
  file: File,
  options: { moveExisting?: boolean; partial?: boolean } = {},
): Promise<ImportRowResult[]> {
  const query = new URLSearchParams({ academic_year_id: academicYearId });
  if (options.moveExisting) query.set("move_existing", "true");
  if (options.partial) query.set("partial", "true");
  const response = await fetch(
    `${API_URL}/v1/academic/enrollments/import/${step}?${query.toString()}`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": XLSX_CONTENT_TYPE },
      body: file,
    },
  );
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ApiError({ status: response.status, code, message: code });
  }
  const body = (await response.json()) as { data: ImportRowResult[] };
  return body.data;
}
