"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  DateRangePicker,
  DialogFooter,
  Field,
  FormError,
  FormSection,
  IconButton,
  Select,
  Textarea,
  type DateRange,
  useToast,
} from "@newsekolah/ui";
import { Camera, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { compressImage, formatFileSize } from "../../../lib/media/compress-image";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import {
  LEAVE_EVIDENCE_MAX_LONG_EDGE,
  type LeaveCategory,
  useSubmitLeaveRequestMutation,
  useUploadEvidenceMutation,
} from "../api";

const CATEGORIES: LeaveCategory[] = ["sick", "religious_ceremony", "dispensation", "other"];

const EMPTY_RANGE: DateRange = { from: "", to: "" };

/**
 * A preview of the picked photo as a data: URL. A blob: object URL would be
 * lighter, but the page's Content-Security-Policy allows images only from
 * 'self', data: and https: (apps/web/middleware.ts), so the browser blocks
 * a blob: thumbnail and shows a broken image. The photo is already
 * compressed (compressImage), so reading it whole is cheap. A read that
 * finishes after the photo changed is dropped.
 */
function usePreviewUrl(file: File | null): string | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    let current = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (current && typeof reader.result === "string") setPreview({ file, url: reader.result });
    };
    reader.readAsDataURL(file);
    return () => {
      current = false;
      reader.abort();
    };
  }, [file]);
  return file && preview?.file === file ? preview.url : null;
}

export function SubmitForm({
  onDone,
  onCancel,
}: {
  onDone: (id: string) => void;
  onCancel?: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const submit = useSubmitLeaveRequestMutation();
  const upload = useUploadEvidenceMutation();
  const [category, setCategory] = useState<LeaveCategory>("sick");
  const [reason, setReason] = useState("");
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidenceWasCompressed, setEvidenceWasCompressed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = usePreviewUrl(evidence);
  const sending = submit.isPending || upload.isPending;
  const startsOn = range.from;
  const endsOn = range.to || range.from;
  // Every category but "other" puts its own fixed label on the letter (the
  // API ignores a typed reason for them), so only "other" asks for one.
  const asksReason = category === "other";

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
    setAttempted(true);
    if ((asksReason && !reason.trim()) || !startsOn || !endsOn) return;
    if (endsOn < startsOn) {
      setError(t("form.rangeError"));
      return;
    }
    try {
      const detail = await submit.mutateAsync({
        category,
        ...(asksReason ? { reason: reason.trim() } : {}),
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
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {error && <FormError>{error}</FormError>}
      <FormSection>
        <Field
          label={t("form.category")}
          hint={asksReason ? undefined : t("form.categoryHint")}
          required
        >
          <Select
            options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
            value={category}
            onValueChange={(v) => {
              setCategory(v as LeaveCategory);
            }}
          />
        </Field>
        <Field
          label={t("form.dates")}
          hint={t("form.datesHint")}
          error={attempted && !startsOn ? t("form.datesRequired") : undefined}
          required
        >
          <DateRangePicker
            value={range}
            onChange={setRange}
            today={todayInZone(me?.tenant.timezone)}
          />
        </Field>
        {asksReason && (
          <Field
            label={t("form.reason")}
            error={attempted && !reason.trim() ? t("form.reasonRequired") : undefined}
            required
            className="col-span-full"
          >
            <Textarea
              rows={3}
              autoResize
              value={reason}
              maxLength={500}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              placeholder={t("form.reasonPlaceholder")}
            />
          </Field>
        )}
        <Field
          label={t("form.evidence")}
          hint={t("form.evidenceHint")}
          optional
          className="col-span-full"
        >
          {(control) => (
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                id={control.id}
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                className="sr-only"
                aria-describedby={control["aria-describedby"]}
                onChange={(e) => {
                  void pickEvidence(e.target.files?.[0]);
                }}
              />
              {evidence ? (
                <Card tone="sunken" className="flex items-center gap-3 p-2">
                  {preview && (
                    <img
                      src={preview}
                      alt={t("form.evidencePreview")}
                      className="size-16 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body text-fg">{evidence.name}</span>
                    {evidenceWasCompressed && (
                      <span className="text-caption text-fg-muted">
                        {t("form.evidenceCompressed", { size: formatFileSize(evidence.size) })}
                      </span>
                    )}
                  </span>
                  <IconButton
                    icon={<X />}
                    aria-label={t("form.evidenceRemove")}
                    variant="ghost"
                    size="lg"
                    onClick={() => {
                      setEvidence(null);
                      setEvidenceWasCompressed(false);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  />
                </Card>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Camera />}
                  onClick={() => fileRef.current?.click()}
                  className="self-start"
                >
                  {t("form.evidenceAdd")}
                </Button>
              )}
            </div>
          )}
        </Field>
      </FormSection>
      <p className="text-body-sm text-fg-muted">{t("form.stagesHint")}</p>
      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button type="submit" loading={sending}>
          {t("form.send")}
        </Button>
      </DialogFooter>
    </form>
  );
}
