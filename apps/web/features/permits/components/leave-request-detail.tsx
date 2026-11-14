"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  DataList,
  DataListItem,
  EmptyState,
  Field,
  Input,
  SkeletonDetail,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Download, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { compressImage } from "../../../lib/media/compress-image";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  LEAVE_EVIDENCE_MAX_LONG_EDGE,
  useIssueLeaveLetterMutation,
  useLeaveDocumentUrlMutation,
  useLeaveRequestQuery,
  useReviewLeaveRequestMutation,
  useUploadEvidenceMutation,
} from "../api";
import { countDays, formatDayRange } from "../lib/permit-dates";

import { WorkflowStepper } from "./workflow-stepper";

export function LeaveRequestDetail({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canReview = useCan("review_leave_requests");
  const canIssue = useCan("issue_leave_letters");
  const { data, isLoading, error, refetch } = useLeaveRequestQuery(id);
  const review = useReviewLeaveRequestMutation();
  const issue = useIssueLeaveLetterMutation();
  const upload = useUploadEvidenceMutation();
  const docUrl = useLeaveDocumentUrlMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  if (isLoading) return <SkeletonDetail rows={4} />;
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    return (
      <EmptyState
        icon={<domainIcons.exitPermit aria-hidden="true" />}
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
      />
    );
  }
  if (error || !data) return <QueryError retry={refetch} error={error} />;
  const inst = data.instance;
  const isOwner = inst.subject_user_id === me?.id;
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };
  const stageKey = inst.current_stage?.key;
  const canAct = inst.status === "in_progress" && canReview && stageKey === "homeroom" && !isOwner;
  const canIssueNow = inst.status === "in_progress" && canIssue && stageKey === "counselor";

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
      <div className="flex flex-col gap-1">
        <p className="text-heading text-fg">{t(`categories.${data.category}`)}</p>
        <p className="text-body-sm text-fg-muted">
          {formatDayRange(data.starts_on, data.ends_on, locale)} ·{" "}
          {t("days", { count: countDays(data.starts_on, data.ends_on) })}
        </p>
      </div>

      <WorkflowStepper instance={inst} />

      <DataList>
        <DataListItem label={t("student")}>
          {data.student_name} ({data.class_name})
        </DataListItem>
        <DataListItem label={t("form.reason")}>{data.reason}</DataListItem>
        <DataListItem label={t("opened")}>
          {formatDateTime(inst.opened_at, { locale, timeZone: me?.tenant.timezone })}
        </DataListItem>
        {data.letter_number && (
          <DataListItem label={t("letterNumber")}>{data.letter_number}</DataListItem>
        )}
      </DataList>

      <div className="flex flex-wrap gap-2">
        {data.has_evidence ? (
          <Button
            variant="secondary"
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
                e.target.value = "";
                if (!file) return;
                void compressImage(file, { maxLongEdge: LEAVE_EVIDENCE_MAX_LONG_EDGE }).then(
                  ({ file: evidence }) => {
                    upload.mutate(
                      { id, file: evidence },
                      {
                        onError: fail,
                        onSuccess: () => {
                          toast.success(t("evidenceUploaded"));
                        },
                      },
                    );
                  },
                );
              }}
            />
            <Button
              variant="secondary"
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
            icon={<Download />}
            loading={docUrl.isPending}
            onClick={() => void openDocument("letter")}
          >
            {t("downloadLetter")}
          </Button>
        )}
      </div>

      {canAct && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <Field label={t("reviewNote")} optional>
            <Input
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
              maxLength={500}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
      {canIssueNow && (
        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
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
      {(inst.status === "completed" || inst.status === "approved") && data.has_letter && (
        <Alert variant="success" title={t("issuedTitle")}>
          {t("issuedBody")}
        </Alert>
      )}
    </div>
  );
}
