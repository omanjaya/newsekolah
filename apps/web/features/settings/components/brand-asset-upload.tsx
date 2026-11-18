"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, cn, Progress, useToast } from "@newsekolah/ui";
import { ImageOff, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { uploadToPresignedUrl } from "../../../lib/api/presigned-upload";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { compressImage } from "../../../lib/media/compress-image";
import {
  useConfirmFaviconUploadMutation,
  useConfirmLogoUploadMutation,
  useRequestFaviconUploadMutation,
  useRequestLogoUploadMutation,
} from "../api";

const ACCEPTED_TYPES = ["image/png", "image/webp", "image/svg+xml"];

// Mirrors the API's own limits (openapi/modules/tenant.yaml): checking
// here first saves a round trip for the common mistake of picking a file
// that is obviously too large, but the server still re-validates the
// uploaded bytes.
const MAX_BYTES: Record<"logo" | "favicon", number> = {
  logo: 2 * 1024 * 1024,
  favicon: 512 * 1024,
};

// A school's mark stays legible at 1024px; SVG is untouched by
// compressImage (it is a vector format, not a raster one) and PNG/WebP
// are the only raster types apps/api's AllowedBrandingImageTypes accepts
// -- JPEG is not, so the output mime type must match the input's own
// family rather than defaulting to JPEG like other upload paths.
const LOGO_MAX_LONG_EDGE: Record<"logo" | "favicon", number> = {
  logo: 1024,
  favicon: 256,
};

/**
 * One presigned-upload row for the tenant logo or favicon (preview tile,
 * name and format, and the upload button), sharing the AvatarUpload flow:
 * request URL, PUT, confirm. It saves as soon as the upload lands.
 */
export function BrandAssetUpload({
  kind,
  currentUrl,
}: {
  kind: "logo" | "favicon";
  currentUrl?: string;
}): ReactElement {
  const t = useTranslations(`app.settings.branding.${kind}`);
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const requestLogoUpload = useRequestLogoUploadMutation();
  const confirmLogoUpload = useConfirmLogoUploadMutation();
  const requestFaviconUpload = useRequestFaviconUploadMutation();
  const confirmFaviconUpload = useConfirmFaviconUploadMutation();
  const requestUpload = kind === "logo" ? requestLogoUpload : requestFaviconUpload;
  const confirmUpload = kind === "logo" ? confirmLogoUpload : confirmFaviconUpload;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(apiErrorMessage("UPLOAD_INVALID_FILE_TYPE"));
      return;
    }

    // The size check runs after compression, not before: an oversized
    // original that compression would bring back under the limit should
    // not be rejected here. SVG passes compressImage untouched, so an
    // oversized SVG still hits this check on its original size, as before.
    // file.type is one of ACCEPTED_TYPES, so it is always "image/png",
    // "image/webp", or "image/svg+xml" -- reusing it as the output mime
    // keeps compressImage from ever turning an accepted format into one
    // the API's AllowedBrandingImageTypes rejects (e.g. JPEG).
    const { file: upload } = await compressImage(file, {
      maxLongEdge: LOGO_MAX_LONG_EDGE[kind],
      mimeType: file.type === "image/webp" ? "image/webp" : "image/png",
    });
    if (upload.size > MAX_BYTES[kind]) {
      toast.error(apiErrorMessage("UPLOAD_FILE_TOO_LARGE"));
      return;
    }

    setProgress(0);
    try {
      const target = await requestUpload.mutateAsync();
      await uploadToPresignedUrl(target.upload_url, upload, setProgress);
      await confirmUpload.mutateAsync(target.object_key);
      toast.success(t("updated"));
    } catch (error) {
      fail(error);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {/* One slot width for both rows, so the logo and favicon text line up. */}
      <div className="flex w-16 shrink-0 justify-center">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md bg-surface-sunken",
            kind === "logo" ? "size-16" : "size-12",
          )}
        >
          {currentUrl ? (
            <img
              src={currentUrl}
              alt={t("previewAlt")}
              className={cn("object-contain", kind === "logo" ? "max-h-12 max-w-12" : "size-6")}
            />
          ) : (
            <ImageOff className="size-5 text-fg-muted" aria-label={t("none")} />
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-label text-fg">{t("title")}</p>
        {progress !== null ? (
          <Progress
            value={progress}
            label={t("uploading", { percent: progress })}
            className="max-w-48"
          />
        ) : (
          <p className="text-body-sm text-fg-muted">{currentUrl ? t("hint") : t("emptyHint")}</p>
        )}
      </div>
      <Button
        type="button"
        variant="secondary"
        icon={<Upload />}
        disabled={progress !== null}
        onClick={() => {
          fileInputRef.current?.click();
        }}
      >
        <span className="sr-only sm:not-sr-only">{currentUrl ? t("change") : t("upload")}</span>
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={currentUrl ? t("change") : t("upload")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
