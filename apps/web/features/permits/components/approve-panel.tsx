"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Card,
  CardHeader,
  CardTitle,
  DataList,
  DataListItem,
  QrPanel,
  QrPanelSkeleton,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type WorkflowInstance,
  encodeScanPayload,
  useExitPermitQuery,
  useInvalidatePermits,
  useIssueScanTokenMutation,
  useLateArrivalQuery,
} from "../api";

import { WorkflowSteps } from "./workflow-stepper";

/** The workflow kinds whose stages an approver satisfies by showing a QR. */
export type ApprovalKind = "exit_permit" | "late_arrival";

/**
 * How often the open sheet re-reads the flow while its QR waits for the
 * student. The scan sends the approver no push (only the flow's subject
 * hears of it), so the sheet polls instead, and only while it is open.
 */
export const APPROVAL_POLL_MS = 3_000;
/** How long the sheet shows "approved" before it hands back to its host. */
export const APPROVED_CLOSE_MS = 2_500;

interface ApprovalSubject {
  instance: WorkflowInstance;
  studentName: string;
  facts: { label: string; value: string }[];
}

/**
 * Who the approval is for, from whichever detail endpoint the kind has:
 * the exit permit carries the student's name, a late arrival only the
 * student id (named through the directory); both carry the class. `fresh`
 * says the flow was read since the sheet opened, so a cached copy from an
 * earlier visit is never taken for the stage this QR approves.
 */
function useApprovalSubject(
  kind: ApprovalKind,
  instanceId: string,
  polling: boolean,
): {
  subject: ApprovalSubject | undefined;
  fresh: boolean;
  error: unknown;
  refetch: () => unknown;
} {
  const t = useTranslations("app.permits.approve");
  const tLate = useTranslations("app.permits.late");
  const pollMs = polling ? APPROVAL_POLL_MS : false;
  const exit = useExitPermitQuery(kind === "exit_permit" ? instanceId : "", { pollMs });
  const late = useLateArrivalQuery(kind === "late_arrival" ? instanceId : "", { pollMs });
  const lateStudentId = late.data?.instance.subject_user_id;
  const names = useDirectoryNames(lateStudentId ? [lateStudentId] : [], kind === "late_arrival");

  if (kind === "exit_permit") {
    return {
      subject: exit.data && {
        instance: exit.data.instance,
        studentName: exit.data.student_name,
        facts: [
          { label: t("class"), value: exit.data.class_name },
          { label: t("destination"), value: exit.data.destination },
        ],
      },
      fresh: exit.isFetchedAfterMount,
      error: exit.error,
      refetch: () => exit.refetch(),
    };
  }
  return {
    subject: late.data && {
      instance: late.data.instance,
      studentName: names.get(late.data.instance.subject_user_id)?.name ?? tLate("unknownStudent"),
      facts: [
        ...(late.data.class_name ? [{ label: t("class"), value: late.data.class_name }] : []),
        { label: t("reason"), value: late.data.reason },
      ],
    },
    fresh: late.isFetchedAfterMount,
    error: late.error,
    refetch: () => late.refetch(),
  };
}

/** Where the flow stands against the stage this sheet's QR approves. */
type Outcome = "waiting" | "approved" | "closed";

/** The stage the sheet opened on: the one its QR approves. */
interface ShownStage {
  index: number;
  label: string;
}

function outcomeOf(instance: WorkflowInstance, shown: ShownStage | null): Outcome {
  const passed =
    shown !== null &&
    (instance.current_stage_index > shown.index ||
      instance.status === "approved" ||
      instance.status === "completed");
  if (passed) return "approved";
  return instance.status === "in_progress" ? "waiting" : "closed";
}

/**
 * An approver's stage QR for one workflow the queue opened (docs/07-ui-ux.md
 * section 4: the student presses "Pindai QR <tahap>" and scans it). The
 * token is bound to this instance and single use, so it is minted once the
 * sheet's first read finds the stage waiting, and renewed by itself when it expires while the stage still waits; the
 * QR prints no code under it, since a 43-character token is not something
 * anyone types. Beside it: who it is for, and where the flow stands. The
 * picket stage of an exit permit does not come here: the duty desk shows
 * one rotating QR for every student instead (DeskQrPanel).
 *
 * While the QR is up the sheet re-reads the flow; once the student's scan
 * moves it past this stage, the QR gives way to "<nama> disetujui untuk
 * tahap <tahap>", the queues are refreshed, and `onApproved` lets the host
 * close the sheet a moment later. A flow that closed some other way
 * (rejected, expired, cancelled) swaps its QR for a note that it is no
 * longer needed; the stepper below says how it ended.
 *
 * The caller keys this component on `instanceId`, so a different instance
 * remounts it and mints afresh instead of resynchronizing state.
 */
export function ApprovePanel({
  kind,
  instanceId,
  onApproved,
}: {
  kind: ApprovalKind;
  instanceId: string;
  /** Called a moment after the student's scan approved the stage. */
  onApproved?: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.approve");
  const tQr = useTranslations("app.permits.qr");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const invalidatePermits = useInvalidatePermits();
  const issue = useIssueScanTokenMutation();
  const [shownStage, setShownStage] = useState<ShownStage | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("waiting");
  const { subject, fresh, error, refetch } = useApprovalSubject(
    kind,
    instanceId,
    outcome === "waiting",
  );
  const instance = subject?.instance;
  const stage = instance?.current_stage;

  // Adjusting state while rendering: the first fresh read fixes the stage
  // this QR approves, and each later read says whether it has passed.
  if (instance && fresh && shownStage === null && instance.status === "in_progress") {
    setShownStage({ index: instance.current_stage_index, label: stage?.label ?? "" });
  }
  if (instance && fresh && outcome === "waiting") {
    const next = outcomeOf(instance, shownStage);
    if (next !== "waiting") setOutcome(next);
  }

  function mint() {
    issue.mutate(
      { purpose: "approve_stage", context_id: instanceId },
      {
        onError: (mintError) => {
          toast.error(
            mintError instanceof ApiError
              ? apiErrorMessage(mintError.code)
              : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  // Mint once the first fresh read finds the stage waiting, not on mount: a
  // flow that is already closed (an exit permit from an earlier day reads
  // as expired) needs no QR, and the token would only be refused.
  const waitingStageRead = shownStage !== null;
  useEffect(() => {
    if (waitingStageRead) mint();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once per instance; the key remount covers a new one
  }, [waitingStageRead]);

  // The latest callback, read when the timer fires. Next's bundled React has
  // no useEffectEvent, so a ref keeps the effect from restarting on each render.
  const onApprovedRef = useRef(onApproved);
  useEffect(() => {
    onApprovedRef.current = onApproved;
  });
  useEffect(() => {
    if (outcome !== "approved") return;
    // The flow left this approver's queue (and the inbox badge).
    invalidatePermits();
    const timer = window.setTimeout(() => {
      onApprovedRef.current?.();
    }, APPROVED_CLOSE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [outcome, invalidatePermits]);

  return (
    <div className="flex flex-col gap-4">
      {outcome === "approved" && subject && shownStage ? (
        <Alert
          tone="success"
          title={t("approvedFor", {
            name: formatDisplayName(subject.studentName),
            stage: shownStage.label,
          })}
        />
      ) : outcome === "closed" && subject ? (
        <Alert
          tone="info"
          title={t("closedFor", { name: formatDisplayName(subject.studentName) })}
        />
      ) : outcome === "closed" ? null : (
        <>
          {issue.data ? (
            <QrPanel
              size="lg"
              autoRenew
              label={stage ? t("qrLabelStage", { stage: stage.label }) : t("qrLabel")}
              payload={encodeScanPayload("approve", instanceId, issue.data.token)}
              code=""
              expiresAt={issue.data.expires_at}
              onRenew={mint}
              renewing={issue.isPending}
              expiredLabel={tQr("expired")}
              expiresInLabel={(seconds) => tQr("expiresIn", { seconds })}
              renewLabel={tQr("renew")}
            />
          ) : issue.isError ? (
            <QueryError retry={mint} error={issue.error} />
          ) : (
            <QrPanelSkeleton size="lg" />
          )}
          <p className="text-body-sm text-fg-muted">
            {stage ? t("hintStage", { stage: stage.label }) : t("hint")}
          </p>
        </>
      )}
      {subject ? (
        <Card padding="md">
          <CardHeader>
            <CardTitle>{formatDisplayName(subject.studentName)}</CardTitle>
          </CardHeader>
          <DataList>
            {subject.facts.map((fact) => (
              <DataListItem key={fact.label} label={fact.label}>
                {fact.value}
              </DataListItem>
            ))}
          </DataList>
          <WorkflowSteps instance={subject.instance} orientation="vertical" />
        </Card>
      ) : error ? (
        <QueryError retry={refetch} error={error} />
      ) : null}
    </div>
  );
}
