import { ApiError } from "@newsekolah/api-client";

/**
 * PUTs a file straight to a presigned object-storage URL with
 * upload-progress reporting, the same way
 * features/onboarding/lib/dapodik-upload.ts goes around the generated
 * `NewsekolahApiClient` for its one long-running upload: openapi-fetch has
 * no progress hook, so this uses a plain `XMLHttpRequest` instead.
 *
 * Unlike the Dapodik upload, this never sends our own API's bearer token:
 * the presigned URL points at object storage (MinIO/S3-compatible), not
 * our API, and a signed URL's authorization is already baked into its
 * query string. Adding an unrelated `Authorization` header would only
 * risk the storage provider rejecting the request.
 */
export function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new ApiError({ status: xhr.status, code: "UNKNOWN", message: "Upload failed" }));
    };
    xhr.onerror = () => {
      reject(new ApiError({ status: 0, code: "NETWORK", message: "Network error" }));
    };

    xhr.send(file);
  });
}
