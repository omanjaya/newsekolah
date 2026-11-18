"use client";

import { SkeletonDetail } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { AppPage } from "../../../components/app-page";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { legacyQueueTarget, reviewerInboxTarget } from "../lib/queue-redirect";
import { useCanSubmitPermit } from "../lib/use-can-submit-permit";

import { ExitPermitsView } from "./exit-permits-view";
import { LateArrivalsView } from "./late-arrivals-view";
import { LeaveRequestsView } from "./leave-requests-view";

export type PermitType = "leave" | "exit" | "late";

/** Which permit routes have something for this reader to do. */
export function usePermitTypes(): PermitType[] {
  const canSubmit = useCanSubmitPermit();
  const canIssue = useCan("issue_leave_letters");
  const canApproveExit = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  return [
    ...(canSubmit || canIssue ? (["leave"] as const) : []),
    ...(canSubmit || canApproveExit || canGate ? (["exit"] as const) : []),
    ...(canSubmit ? (["late"] as const) : []),
  ];
}

/**
 * One route, one meaning (docs/07-ui-ux.md section 8: no route aliases):
 * /leave-requests, /exit-permits and /late-arrivals each render their own
 * screen with their own title, and the area's tabs move between them.
 * Reviewing lives in the Perlu tindakan inbox: old review-queue links, and
 * a reviewer with nothing to do on this route, go straight there.
 */
export function PermitsWorkspaceView({
  initialType = "leave",
}: {
  initialType?: string;
}): ReactElement {
  const router = useRouter();
  const { me, isReady } = useSession();
  const searchParams = useSearchParams();
  const types = usePermitTypes();
  const canReviewLeave = useCan("review_leave_requests");
  const canApproveExit = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const canReviewLate = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const canReview = canReviewLeave || canApproveExit || canGate || canReviewLate;
  const type = types.find((option) => option === initialType);

  const redirectTarget =
    isReady && canReview
      ? (legacyQueueTarget(new URLSearchParams(searchParams.toString()), initialType) ??
        (type === undefined ? reviewerInboxTarget(initialType) : null))
      : null;
  useEffect(() => {
    if (redirectTarget) router.replace(redirectTarget);
  }, [redirectTarget, router]);

  if (redirectTarget) {
    return (
      <AppPage header={false} nav={false}>
        <SkeletonDetail />
      </AppPage>
    );
  }

  if (initialType === "exit") return <ExitPermitsView />;
  if (initialType === "late") return <LateArrivalsView />;
  return <LeaveRequestsView />;
}
