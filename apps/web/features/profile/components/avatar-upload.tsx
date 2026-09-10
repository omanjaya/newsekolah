"use client";

import { ApiError } from "@newsekolah/api-client";
import { Avatar, Button, Progress, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useConfirmAvatarUploadMutation, useRequestAvatarUploadMutation } from "../api";
import { uploadToPresignedUrl } from "../lib/avatar-upload";

// Mirrors apps/api's allowedAvatarTypes and defaultAvatarMaxBytes
// (profile_admin.go): checking here first saves a round trip for the
// common mistake of picking the wrong file, but the server still
// re-validates the uploaded bytes -- this is a courtesy, not the guard.
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarUpload(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.profile.avatar");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const requestUpload = useRequestAvatarUploadMutation();
  const confirmUpload = useConfirmAvatarUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  if (!me) return null;

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
    if (file.size > MAX_BYTES) {
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
    <div className="flex items-center gap-4">
      <Avatar name={me.name} src={me.avatar_url} className="size-16 text-[20px]" />
      <div className="flex flex-col gap-2">
        {progress !== null ? (
          <Progress
            value={progress}
            label={t("uploading", { percent: progress })}
            className="w-48"
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
    </div>
  );
}
