"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, useToast } from "@newsekolah/ui";
import { Camera, ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { compressImage } from "../../../lib/media/compress-image";
import {
  VIOLATION_ATTACHMENT_MAX_BYTES,
  VIOLATION_ATTACHMENT_MAX_COUNT,
  VIOLATION_ATTACHMENT_TYPES,
  useUploadViolationAttachmentMutation,
  useViolationAttachmentUrlMutation,
  useViolationAttachmentsQuery,
} from "../api-violation-extras";

// apps/api's reencodeAttachmentImage only decodes JPEG/PNG, so the
// compressed output must stay JPEG (compressImage's default) rather than
// WebP -- mirrors counseling-attachments and leave-request evidence.
const ATTACHMENT_MAX_LONG_EDGE = 1600;

/**
 * Photo evidence on one violation record: 1-3 JPEG/PNG photos, uploaded
 * through a presigned URL then confirmed (same shape as counseling
 * attachments and leave-request evidence), shown here as thumbnails
 * fetched lazily through short-lived signed URLs. Visibility is whatever
 * permission already gates the violation record this sits inside (this
 * component adds no visibility rule of its own); `canUpload` additionally
 * requires `record_violations`.
 */
export function ViolationAttachments({
  recordId,
  canUpload,
}: {
  recordId: string;
  canUpload: boolean;
}): ReactElement {
  const t = useTranslations("app.discipline.violations.attachments");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);

  const attachments = useViolationAttachmentsQuery(recordId);
  const upload = useUploadViolationAttachmentMutation();
  const attachmentUrl = useViolationAttachmentUrlMutation();

  const items = attachments.data?.data ?? [];
  const atMax = items.length >= VIOLATION_ATTACHMENT_MAX_COUNT;

  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  // Tracks which attachment ids already have a signed-URL request in
  // flight or resolved, so a re-render (e.g. from setThumbnails itself)
  // never re-requests the same id -- a ref, not state, since it only
  // guards the effect's own side effect and must not itself schedule a
  // render.
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const item of items) {
      if (requested.current.has(item.id)) continue;
      requested.current.add(item.id);
      attachmentUrl.mutate(
        { recordId, attachmentId: item.id },
        {
          onSuccess: (result) => {
            setThumbnails((current) => ({ ...current, [item.id]: result.url }));
          },
          onError: () => {
            setThumbnails((current) => ({ ...current, [item.id]: null }));
          },
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per new attachment id only
  }, [items.map((i) => i.id).join(",")]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!VIOLATION_ATTACHMENT_TYPES.includes(file.type)) {
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
    if (attachment.size > VIOLATION_ATTACHMENT_MAX_BYTES) {
      toast.error(t("tooLarge"));
      return;
    }
    upload.mutate(
      { recordId, file: attachment },
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

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-fg">{t("title")}</span>
        {canUpload && !atMax && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<Camera />}
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
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handleFile(e);
          }}
        />
      </div>
      {canUpload && atMax && <p className="text-[13px] text-fg-muted">{t("maxReached")}</p>}
      {items.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((attachment) => {
            const src = thumbnails[attachment.id];
            return (
              <li key={attachment.id}>
                {src ? (
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    <img
                      src={src}
                      alt={t("photoAlt")}
                      className="size-20 rounded-sm border border-border object-cover"
                    />
                  </a>
                ) : src === null ? (
                  <div className="flex size-20 items-center justify-center rounded-sm border border-border bg-bg text-fg-muted">
                    <ImageOff className="size-5" aria-hidden="true" />
                  </div>
                ) : (
                  <div
                    className="size-20 animate-pulse rounded-sm border border-border bg-bg"
                    aria-busy="true"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
