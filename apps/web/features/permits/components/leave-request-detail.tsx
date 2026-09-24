"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Alert, Button, EmptyState, Input, Skeleton, domainIcons, useToast } from "@newsekolah/ui";
import { Download, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  useIssueLeaveLetterMutation,
  useLeaveDocumentUrlMutation,
  useLeaveRequestQuery,
  useReviewLeaveRequestAsGuardianMutation,
  useReviewLeaveRequestMutation,
  useUploadEvidenceMutation,
} from "../api";

import { WorkflowStepper } from "./workflow-stepper";

export function LeaveRequestDetail({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canReview = useCan("review_leave_requests");
  const canIssue = useCan("issue_leave_letters");
  const canApproveAsGuardian = useCan("approve_child_leave_requests");
  const { data, isLoading, error, refetch } = useLeaveRequestQuery(id);
  const review = useReviewLeaveRequestMutation();
  const guardianReview = useReviewLeaveRequestAsGuardianMutation();
  const issue = useIssueLeaveLetterMutation();
  const upload = useUploadEvidenceMutation();
  const docUrl = useLeaveDocumentUrlMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [guardianNote, setGuardianNote] = useState("");
  const [guardianError, setGuardianError] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    return (
      <EmptyState
        icon={<domainIcons.exitPermit aria-hidden="true" />}
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
      />
    );
  }
  if (error || !data) return <QueryError retry={refetch} />;
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
      {inst.status === "in_progress" &&
        canApproveAsGuardian &&
        inst.current_stage?.approver_rule === "guardian_of_student" &&
        !isOwner && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("guardian.reviewNote")}</span>
              <Input
                value={guardianNote}
                onChange={(e) => {
                  setGuardianNote(e.target.value);
                  setGuardianError(null);
                }}
                maxLength={500}
              />
            </label>
            {guardianError && (
              <p role="alert" className="text-[13px] text-status-absent">
                {guardianError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                loading={guardianReview.isPending && !guardianReview.variables.approve}
                onClick={() => {
                  const trimmed = guardianNote.trim();
                  if (!trimmed) {
                    setGuardianError(t("guardian.reasonRequired"));
                    return;
                  }
                  guardianReview.mutate(
                    { id, approve: false, note: trimmed },
                    {
                      onError: fail,
                      onSuccess: () => {
                        toast.success(t("guardian.rejected"));
                      },
                    },
                  );
                }}
              >
                {t("guardian.reject")}
              </Button>
              <Button
                loading={guardianReview.isPending && guardianReview.variables.approve}
                onClick={() => {
                  guardianReview.mutate(
                    { id, approve: true, note: guardianNote.trim() || undefined },
                    {
                      onError: fail,
                      onSuccess: () => {
                        toast.success(t("guardian.approved"));
                      },
                    },
                  );
                }}
              >
                {t("guardian.approve")}
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
