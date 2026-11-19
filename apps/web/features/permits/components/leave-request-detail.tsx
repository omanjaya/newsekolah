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
  cn,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Download, Upload } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useStuckToBottom } from "../../../lib/hooks/use-stuck-to-bottom";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { compressImage } from "../../../lib/media/compress-image";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
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

/**
 * One leave request: where it stands, its details and documents, and the
 * reader's decision. `layout="page"` (the notification's full page) leaves
 * the category, student and dates to the page header and keeps the
 * decision in reach at the bottom of a phone's screen; the default is the
 * inbox's dialog, which has no such header.
 */
export function LeaveRequestDetail({
  id,
  layout = "dialog",
}: {
  id: string;
  layout?: "dialog" | "page";
}): ReactElement {
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
  // A malformed id (a truncated link) is as missing as an unknown one, and
  // a request the viewer may not see reads the same, so no id is confirmed.
  if (isNotFoundError(error) || (error instanceof ApiError && error.status === 403)) {
    // The full page offers a way on: a reviewer to the leave queue, anyone
    // else to their own requests. The inbox dialog just closes.
    const reviewer = canReview || canIssue;
    return (
      <EmptyState
        icon={<domainIcons.leave aria-hidden="true" />}
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        action={
          layout === "page" ? (
            <Button asChild variant="secondary">
              <Link href={reviewer ? "/inbox?type=leave" : "/leave-requests"}>
                {reviewer ? t("issuerOpenInbox") : t("notFoundBackToMine")}
              </Link>
            </Button>
          ) : undefined
        }
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

  const docked = layout === "page";
  const issued = (inst.status === "completed" || inst.status === "approved") && data.has_letter;
  const letterButton = (size?: "sm") => (
    <Button
      variant="secondary"
      size={size}
      icon={<Download />}
      loading={docUrl.isPending && docUrl.variables.kind === "letter"}
      onClick={() => void openDocument("letter")}
    >
      {t("downloadLetter")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      {layout === "dialog" && (
        <div className="flex flex-col gap-1">
          <p className="text-heading text-fg">{t(`categories.${data.category}`)}</p>
          <p className="text-body-sm text-fg-muted">
            {formatDayRange(data.starts_on, data.ends_on, locale)} ·{" "}
            {t("days", { count: countDays(data.starts_on, data.ends_on) })}
          </p>
        </div>
      )}

      {/* The outcome first, once there is one, with the letter it produced
          (beside the title from 640px up, under the text on a phone), then
          how it got there. */}
      {issued && (
        <Alert variant="success" title={t("issuedTitle")} action={letterButton("sm")}>
          {t("issuedBody")}
        </Alert>
      )}

      <WorkflowStepper
        instance={inst}
        finalOutcome={data.has_letter ? t("letterIssuedStep") : undefined}
      />

      <DataList>
        <DataListItem label={t("student")}>
          {formatDisplayName(data.student_name)} ({data.class_name})
        </DataListItem>
        <DataListItem label={t("form.reason")}>{data.reason}</DataListItem>
        <DataListItem label={t("opened")}>
          {formatDateTime(inst.opened_at, { locale, timeZone: me?.tenant.timezone })}
        </DataListItem>
        {data.letter_number && (
          <DataListItem label={t("letterNumber")}>{data.letter_number}</DataListItem>
        )}
      </DataList>

      <div className="flex flex-wrap gap-2 empty:hidden">
        {data.has_evidence ? (
          <Button
            variant="secondary"
            icon={<Download />}
            loading={docUrl.isPending && docUrl.variables.kind === "evidence"}
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
        {/* The issued alert carries the letter; this is for a letter
            without that outcome. */}
        {data.has_letter && !issued && letterButton()}
      </div>

      {canAct && (
        <>
          {/* The note stays in the flow; only the buttons dock. */}
          <div className="border-t border-line pt-4">
            <Field label={t("reviewNote")} optional>
              <Input
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                maxLength={500}
              />
            </Field>
          </div>
          {/* Side by side on a phone (Tolak, then the main Setujui), a
              right-aligned row from 640px up. */}
          <DecisionDock docked={docked} className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
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
          </DecisionDock>
        </>
      )}
      {canIssueNow && (
        <DecisionDock
          docked={docked}
          className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end"
        >
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
        </DecisionDock>
      )}
    </div>
  );
}

// On the page, a phone keeps the decision's buttons docked on the tab bar
// while the reader scrolls the request, as a StickySaveBar docks: at the
// bar plus the home indicator. Only while stuck does the row take the
// centre button's rise as bottom padding, so that button paints over
// padding and no strip of page shows between the two bars; at rest it ends
// the card with the card's own padding. The row spans the card's padding;
// the card clips it to its rounded corners at rest.
const DOCK_CLASS =
  "max-md:sticky max-md:bottom-[calc(var(--shell-mobile-tab-bar,0px)+env(safe-area-inset-bottom))] max-md:z-sticky max-md:-mx-5 max-md:-mb-5 max-md:border-t max-md:border-line max-md:bg-surface max-md:px-5 max-md:pt-3 max-md:pb-5 max-md:data-stuck:pb-[calc(var(--space-3)+var(--shell-mobile-tab-raise,0px))]";

function DecisionDock({
  docked,
  className,
  children,
}: {
  docked: boolean;
  className: string;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useStuckToBottom(ref, docked);
  return (
    <div
      ref={ref}
      data-slot="leave-decision"
      data-stuck={stuck || undefined}
      className={cn(className, docked && DOCK_CLASS)}
    >
      {children}
    </div>
  );
}
