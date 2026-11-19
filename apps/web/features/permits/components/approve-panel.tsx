"use client";

import { ApiError } from "@newsekolah/api-client";
import {
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
import { useEffect } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type WorkflowInstance,
  encodeScanPayload,
  useExitPermitQuery,
  useIssueScanTokenMutation,
  useLateArrivalQuery,
} from "../api";

import { WorkflowSteps } from "./workflow-stepper";

/** The workflow kinds whose stages an approver satisfies by showing a QR. */
export type ApprovalKind = "exit_permit" | "late_arrival";

interface ApprovalSubject {
  instance: WorkflowInstance;
  studentName: string;
  facts: { label: string; value: string }[];
}

/**
 * Who the approval is for, from whichever detail endpoint the kind has:
 * the exit permit carries the student's name and class, a late arrival only
 * the student id (named through the directory) and the reason.
 */
function useApprovalSubject(
  kind: ApprovalKind,
  instanceId: string,
): {
  subject: ApprovalSubject | undefined;
  error: unknown;
  refetch: () => unknown;
} {
  const t = useTranslations("app.permits.approve");
  const tLate = useTranslations("app.permits.late");
  const exit = useExitPermitQuery(kind === "exit_permit" ? instanceId : "");
  const late = useLateArrivalQuery(kind === "late_arrival" ? instanceId : "");
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
      error: exit.error,
      refetch: () => exit.refetch(),
    };
  }
  return {
    subject: late.data && {
      instance: late.data.instance,
      studentName: names.get(late.data.instance.subject_user_id)?.name ?? tLate("unknownStudent"),
      facts: [{ label: t("reason"), value: late.data.reason }],
    },
    error: late.error,
    refetch: () => late.refetch(),
  };
}

/**
 * An approver's stage QR for one workflow the queue opened (docs/07-ui-ux.md
 * section 4: the student presses "Pindai QR <tahap>" and scans it). The
 * token is bound to this instance, so it is minted on open and renewed on
 * request; the QR prints no code under it, since a 43-character token is
 * not something anyone types. Beside it: who it is for, and where the flow
 * stands. The picket stage of an exit permit does not come here: the duty
 * desk shows one rotating QR for every student instead (DeskQrPanel).
 *
 * The caller keys this component on `instanceId`, so a different instance
 * remounts it and mints afresh instead of resynchronizing state.
 */
export function ApprovePanel({
  kind,
  instanceId,
}: {
  kind: ApprovalKind;
  instanceId: string;
}): ReactElement {
  const t = useTranslations("app.permits.approve");
  const tQr = useTranslations("app.permits.qr");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const issue = useIssueScanTokenMutation();
  const { subject, error, refetch } = useApprovalSubject(kind, instanceId);
  const stage = subject?.instance.current_stage;

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

  useEffect(() => {
    mint();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once on mount; the key remount covers a new instance
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {issue.data ? (
        <QrPanel
          size="lg"
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
