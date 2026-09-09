import { ApiError } from "@newsekolah/api-client";

import { getAccessToken } from "../../../lib/api/access-token";
import { API_URL } from "../../../lib/env";

/**
 * Uploads a Dapodik CSV export to the preview or commit endpoint with
 * upload-progress reporting. The generated `NewsekolahApiClient`
 * (openapi-fetch) has no hook for upload progress, so this step -- the one
 * place in the onboarding wizard that can take a while on a school's own
 * connection -- goes around it with a plain `XMLHttpRequest`, matching what
 * the endpoint itself expects: a raw `text/csv` body, not multipart form
 * data (see openapi/modules/tenant.yaml).
 *
 * This intentionally skips the generated client's access-token refresh
 * retry: an expired token here just fails the upload, and the wizard's own
 * error state lets the school retry after any other screen has silently
 * refreshed the session.
 */
export function uploadDapodikCsv<T>(
  path: "/v1/tenant/onboarding/dapodik/preview" | "/v1/tenant/onboarding/dapodik/commit",
  file: File,
  locale: string,
  onProgress: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    xhr.setRequestHeader("Content-Type", "text/csv");
    xhr.setRequestHeader("Accept-Language", locale);
    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText) as unknown;
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(body as T);
        return;
      }
      const errorBody = (body as { error?: { code?: string; message?: string } } | undefined)
        ?.error;
      reject(
        new ApiError({
          status: xhr.status,
          code: errorBody?.code ?? "UNKNOWN",
          message: errorBody?.message ?? (xhr.statusText || "Request failed"),
        }),
      );
    };
    xhr.onerror = () => {
      reject(new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Network error" }));
    };

    xhr.send(file);
  });
}
