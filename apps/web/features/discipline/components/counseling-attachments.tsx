"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, useToast } from "@newsekolah/ui";
import { Download, Paperclip, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, ReactElement } from "react";
import { useRef } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { compressImage } from "../../../lib/media/compress-image";
import { useSession } from "../../../lib/session/session-provider";
import {
  COUNSELING_ATTACHMENT_MAX_BYTES,
  COUNSELING_ATTACHMENT_TYPES,
  useCounselingAttachmentUrlMutation,
  useCounselingAttachmentsQuery,
  useUploadCounselingAttachmentMutation,
} from "../api-counseling-extras";

// Matches leave-request evidence and violation attachments: apps/api's
// reencodeAttachmentImage only decodes JPEG/PNG, so the compressed output
// must stay JPEG (the default compressImage produces) rather than WebP.
const ATTACHMENT_MAX_LONG_EDGE = 1600;

/**
 * Attachments on one counseling note: JPEG or PNG up to 10 MB, uploaded
 * through a presigned URL then confirmed, listed and downloaded here. The
 * API enforces the note's own visibility on every call, so this component
 * never needs to duplicate that check.
 */
export function CounselingAttachments({
  counselingId,
  canUpload,
}: {
  counselingId: string;
  canUpload: boolean;
}): ReactElement {
  const t = useTranslations("app.discipline.counseling.attachments");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);

  const attachments = useCounselingAttachmentsQuery(counselingId);
  const upload = useUploadCounselingAttachmentMutation();
  const documentUrl = useCounselingAttachmentUrlMutation();

  const items = attachments.data?.data ?? [];

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!COUNSELING_ATTACHMENT_TYPES.includes(file.type)) {
      toast.error(t("invalidType"));
      return;
    }
    // The size check runs after compression, not before: a phone photo
    // routinely starts well above the limit and compressImage brings it
    // back under it, so rejecting on the original's size here would
    // block uploads compression was meant to rescue.
    const { file: attachment } = await compressImage(file, {
      maxLongEdge: ATTACHMENT_MAX_LONG_EDGE,
    });
    if (attachment.size > COUNSELING_ATTACHMENT_MAX_BYTES) {
      toast.error(t("tooLarge"));
      return;
    }
    upload.mutate(
      { counselingId, file: attachment },
      {
        onSuccess: () => {
          toast.success(t("uploaded"));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  function download(attachmentId: string) {
    documentUrl.mutate(
      { counselingId, attachmentId },
      {
        onSuccess: (result) => {
          window.open(result.url, "_blank", "noopener,noreferrer");
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-fg">{t("title")}</span>
        {canUpload && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<Upload />}
            loading={upload.isPending}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            {t("add")}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            void handleFile(e);
          }}
        />
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-1.5 text-fg">
                <Paperclip className="size-4 text-fg-muted" aria-hidden="true" />
                {formatDateTime(attachment.created_at, { locale, timeZone: me?.tenant.timezone })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Download />}
                loading={documentUrl.isPending}
                onClick={() => {
                  download(attachment.id);
                }}
              >
                {t("download")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
