import { ApiError } from "@newsekolah/api-client";

/**
 * PUTs a file straight to a presigned object-storage URL with
 * upload-progress reporting: openapi-fetch has no progress hook, so every
 * presigned-upload flow (avatar, tenant logo, tenant favicon) goes around
 * the generated client with a plain `XMLHttpRequest` instead. Never sends
 * our own API's bearer token: the presigned URL points at object storage
 * (MinIO/S3-compatible), not our API, and a signed URL's authorization is
 * already baked into its query string.
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
