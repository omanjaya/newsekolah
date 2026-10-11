"use client";

import { PageHeader, Select, Skeleton } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { legacyQueueTarget, reviewerInboxTarget } from "../lib/queue-redirect";

import { ExitPermitsView } from "./exit-permits-view";
import { LateArrivalsView } from "./late-arrivals-view";
import { LeaveRequestsView } from "./leave-requests-view";
import { ReviewInboxBanner } from "./review-inbox-banner";

/**
 * Submit and follow requests per type (leave, exit, late). Reviewing lives
 * in the Perlu Tindakan inbox: reviewers get a link to it here, and old
 * review-queue links, or a reviewer with nothing to submit, go straight there.
 */
export function PermitsWorkspaceView({
  initialType = "leave",
}: {
  initialType?: string;
}): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const router = useRouter();
  const { me, isReady } = useSession();
  const searchParams = useSearchParams();
  const canSubmit = useCan("submit_leave_requests");
  const canReviewLeave = useCan("review_leave_requests");
  const canIssue = useCan("issue_leave_letters");
  const canApproveExit = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const canReviewLate = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const canReview = canReviewLeave || canApproveExit || canGate || canReviewLate;
  const options = [
    ...(canSubmit || canIssue ? [{ value: "leave", label: t("leave") }] : []),
    ...(canSubmit || canApproveExit || canGate ? [{ value: "exit", label: t("exit") }] : []),
    ...(canSubmit ? [{ value: "late", label: t("late") }] : []),
  ];
  const defaultType = options.some((option) => option.value === initialType)
    ? initialType
    : (options[0]?.value ?? "none");
  const [type, setType] = useUrlState<string>(
    "type",
    options.map((option) => option.value),
    defaultType,
  );

  const redirectTarget =
    isReady && canReview
      ? (legacyQueueTarget(new URLSearchParams(searchParams.toString()), initialType) ??
        (options.length === 0 ? reviewerInboxTarget(initialType) : null))
      : null;
  useEffect(() => {
    if (redirectTarget) router.replace(redirectTarget);
  }, [redirectTarget, router]);

  if (redirectTarget) {
    return (
      <div className="p-4 md:p-6">
        <Skeleton className="h-24 w-full" aria-busy="true" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t("permits")} />
      {canReview && <ReviewInboxBanner />}
      {options.length > 0 ? (
        <>
          {options.length > 1 && (
            <label className="flex max-w-sm flex-col gap-1 text-[13px]">
              <span className="font-medium">{canSubmit ? t("requestKind") : t("permitKind")}</span>
              <Select value={type} onValueChange={setType} options={options} />
            </label>
          )}
          {type === "leave" && <LeaveRequestsView embedded />}
          {type === "exit" && <ExitPermitsView embedded />}
          {type === "late" && <LateArrivalsView embedded />}
        </>
      ) : (
        <p className="text-sm text-fg-muted">{t("noAccess")}</p>
      )}
    </div>
  );
}
