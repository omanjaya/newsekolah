"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { Camera, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { compressImage, formatFileSize } from "../../../lib/media/compress-image";
import {
  LEAVE_EVIDENCE_MAX_LONG_EDGE,
  type LeaveCategory,
  useSubmitLeaveRequestMutation,
  useUploadEvidenceMutation,
} from "../api";

const CATEGORIES: LeaveCategory[] = ["sick", "religious_ceremony", "dispensation", "other"];

export function SubmitForm({ onDone }: { onDone: (id: string) => void }): ReactElement {
  const t = useTranslations("app.permits.leave");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const submit = useSubmitLeaveRequestMutation();
  const upload = useUploadEvidenceMutation();
  const [category, setCategory] = useState<LeaveCategory>("sick");
  const [reason, setReason] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidenceWasCompressed, setEvidenceWasCompressed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sending = submit.isPending || upload.isPending;

  async function pickEvidence(file: File | undefined) {
    if (!file) {
      setEvidence(null);
      setEvidenceWasCompressed(false);
      return;
    }
    const compressed = await compressImage(file, { maxLongEdge: LEAVE_EVIDENCE_MAX_LONG_EDGE });
    setEvidence(compressed.file);
    setEvidenceWasCompressed(compressed.wasCompressed);
  }

  async function send() {
    setError(null);
    if (!reason.trim() || !startsOn || !endsOn) {
      setError(t("form.requiredError"));
      return;
    }
    if (endsOn < startsOn) {
      setError(t("form.rangeError"));
      return;
    }
    try {
      const detail = await submit.mutateAsync({
        category,
        reason: reason.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
      });
      // The evidence upload is a second call chained onto the newly
      // created instance (the API has no "create with attachment" path),
      // but from the reviewer's screen it still lands as one submission --
      // the request never shows up without its evidence already attached.
      // A failed upload does not roll back the request itself: it can
      // still be attached later from the detail screen, so the submitter
      // is only warned, not blocked.
      if (evidence) {
        try {
          await upload.mutateAsync({ id: detail.instance.id, file: evidence });
        } catch {
          toast.error(t("form.evidenceUploadFailed"));
        }
      }
      toast.success(t("form.submitted"));
      onDone(detail.instance.id);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("form.category")}</span>
        <Select
          options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
          value={category}
          onValueChange={(v) => {
            setCategory(v as LeaveCategory);
          }}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("form.startsOn")}</span>
          <Input
            type="date"
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value);
              if (!endsOn) setEndsOn(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("form.endsOn")}</span>
          <Input
            type="date"
            value={endsOn}
            onChange={(e) => {
              setEndsOn(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("form.reason")}</span>
        <Textarea
          rows={3}
          value={reason}
          maxLength={500}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </label>
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("form.evidence")}</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void pickEvidence(e.target.files?.[0]);
          }}
        />
        {evidence ? (
          <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg px-3 py-2">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-fg">{evidence.name}</span>
              {evidenceWasCompressed && (
                <span className="text-[12px] text-fg-muted">
                  {t("form.evidenceCompressed", { size: formatFileSize(evidence.size) })}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label={t("form.evidenceRemove")}
              className="flex size-8 shrink-0 items-center justify-center rounded-xs text-fg-muted hover:bg-surface hover:text-fg"
              onClick={() => {
                setEvidence(null);
                setEvidenceWasCompressed(false);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Camera />}
            onClick={() => fileRef.current?.click()}
            className="self-start"
          >
            {t("form.evidenceAdd")}
          </Button>
        )}
        <p className="text-fg-muted">{t("form.evidenceHint")}</p>
      </div>
      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={sending}>
          {t("form.send")}
        </Button>
      </div>
    </form>
  );
}
