"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Alert, Button, Input, Select, Skeleton, Textarea, useToast } from "@newsekolah/ui";
import { Download, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  type LeaveCategory,
  useIssueLeaveLetterMutation,
  useLeaveDocumentUrlMutation,
  useLeaveRequestQuery,
  useReviewLeaveRequestMutation,
  useSubmitLeaveRequestMutation,
  useUploadEvidenceMutation,
} from "../api";

import { WorkflowStepper } from "./workflow-stepper";

const CATEGORIES: LeaveCategory[] = ["sick", "religious_ceremony", "dispensation", "other"];

export function SubmitForm({ onDone }: { onDone: (id: string) => void }): ReactElement {
  const t = useTranslations("app.permits.leave");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const submit = useSubmitLeaveRequestMutation();
  const [category, setCategory] = useState<LeaveCategory>("sick");
  const [reason, setReason] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <p className="text-[13px] text-fg-muted">{t("form.evidenceHint")}</p>
      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={submit.isPending}>
          {t("form.send")}
        </Button>
      </div>
    </form>
  );
}

export function LeaveRequestDetail({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canReview = useCan("review_leave_requests");
  const canIssue = useCan("issue_leave_letters");
  const { data, isLoading } = useLeaveRequestQuery(id);
  const review = useReviewLeaveRequestMutation();
  const issue = useIssueLeaveLetterMutation();
  const upload = useUploadEvidenceMutation();
  const docUrl = useLeaveDocumentUrlMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  if (isLoading || !data) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  const inst = data.instance;
  const isOwner = inst.subject_user_id === me?.id;
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };
  const stageKey = inst.current_stage?.key;

  async function openDocument(kind: "evidence" | "letter") {
    try {
      const result = await docUrl.mutateAsync({ id, kind });
      window.open(result.url, "_blank", "noopener");
    } catch (error) {
      fail(error);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        <dt className="text-fg-muted">{t("student")}</dt>
        <dd>
          {data.student_name} ({data.class_name})
        </dd>
        <dt className="text-fg-muted">{t("form.category")}</dt>
        <dd>{t(`categories.${data.category}`)}</dd>
        <dt className="text-fg-muted">{t("dates")}</dt>
        <dd>
          {formatDate(data.starts_on, { locale, timeZone: me?.tenant.timezone })} -{" "}
          {formatDate(data.ends_on, { locale, timeZone: me?.tenant.timezone })}
        </dd>
        <dt className="text-fg-muted">{t("form.reason")}</dt>
        <dd>{data.reason}</dd>
        {data.letter_number && (
          <>
            <dt className="text-fg-muted">{t("letterNumber")}</dt>
            <dd>{data.letter_number}</dd>
          </>
        )}
      </dl>
      <WorkflowStepper instance={inst} />

      <div className="flex flex-wrap gap-2">
        {data.has_evidence ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<Download />}
            loading={docUrl.isPending}
            onClick={() => void openDocument("evidence")}
          >
            {t("viewEvidence")}
          </Button>
        ) : isOwner && inst.status === "in_progress" ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  upload.mutate(
                    { id, file },
                    {
                      onError: fail,
                      onSuccess: () => {
                        toast.success(t("evidenceUploaded"));
                      },
                    },
                  );
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload />}
              loading={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {t("uploadEvidence")}
            </Button>
          </>
        ) : null}
        {data.has_letter && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Download />}
            loading={docUrl.isPending}
            onClick={() => void openDocument("letter")}
          >
            {t("downloadLetter")}
          </Button>
        )}
      </div>

      {inst.status === "in_progress" && canReview && stageKey === "homeroom" && !isOwner && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("reviewNote")}</span>
            <Input
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
              maxLength={500}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              loading={review.isPending && !review.variables.approve}
              onClick={() => {
                review.mutate(
                  { id, approve: false, note: note.trim() || undefined },
                  {
                    onError: fail,
                    onSuccess: () => {
                      toast.success(t("rejected"));
                    },
                  },
                );
              }}
            >
              {t("reject")}
            </Button>
            <Button
              loading={review.isPending && review.variables.approve}
              onClick={() => {
                review.mutate(
                  { id, approve: true, note: note.trim() || undefined },
                  {
                    onError: fail,
                    onSuccess: () => {
                      toast.success(t("approved"));
                    },
                  },
                );
              }}
            >
              {t("approve")}
            </Button>
          </div>
        </div>
      )}
      {inst.status === "in_progress" && canIssue && stageKey === "counselor" && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            loading={issue.isPending}
            onClick={() => {
              issue.mutate(id, {
                onError: fail,
                onSuccess: () => {
                  toast.success(t("issued"));
                },
              });
            }}
          >
            {t("issueLetter")}
          </Button>
        </div>
      )}
      {inst.status === "approved" && data.has_letter && (
        <Alert variant="info" title={t("issuedTitle")}>
          {t("issuedBody")}
        </Alert>
      )}
    </div>
  );
}
