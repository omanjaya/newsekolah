"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Progress, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { uploadToPresignedUrl } from "../../../lib/api/presigned-upload";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
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

/** One presigned-upload slot for the tenant logo or favicon, sharing the AvatarUpload flow: request URL, PUT, confirm. */
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
    if (file.size > MAX_BYTES[kind]) {
      toast.error(apiErrorMessage("UPLOAD_FILE_TOO_LARGE"));
      return;
    }

    setProgress(0);
    try {
      const target = await requestUpload.mutateAsync();
      await uploadToPresignedUrl(target.upload_url, file, setProgress);
      await confirmUpload.mutateAsync(target.object_key);
      toast.success(t("updated"));
    } catch (error) {
      fail(error);
    } finally {
      setProgress(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xs border border-border bg-bg">
          {currentUrl ? (
            <img
              src={currentUrl}
              alt={t("previewAlt")}
              className="max-h-14 max-w-14 object-contain"
            />
          ) : (
            <span className="text-[11px] text-fg-muted">{t("none")}</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          {progress !== null ? (
            <Progress
              value={progress}
              label={t("uploading", { percent: progress })}
              className="w-40"
            />
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                fileInputRef.current?.click();
              }}
            >
              {t("change")}
            </Button>
          )}
          <p className="text-[12px] text-fg-muted">{t("hint")}</p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        aria-label={t("change")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </section>
  );
}
