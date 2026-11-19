"use client";

import { ApiError } from "@newsekolah/api-client";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { RecordNotFoundPage } from "../../../components/record-not-found";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useCan } from "../../../lib/session/session-provider";

/**
 * Whether a leave request read failed because the reader has no such
 * request to open: an unknown id, a malformed one (a truncated link), or a
 * request they may not see, which reads the same so no id is confirmed.
 */
export function isLeaveRequestMissing(error: unknown): boolean {
  return isNotFoundError(error) || (error instanceof ApiError && error.status === 403);
}

/**
 * The leave request's own page when there is no request to open: the
 * shared not-found page (its title is also the tab's) with a way on, a
 * reviewer to the leave queue and anyone else to their own requests.
 */
export function LeaveRequestNotFoundPage(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const canReview = useCan("review_leave_requests");
  const canIssue = useCan("issue_leave_letters");
  const reviewer = canReview || canIssue;
  return (
    <RecordNotFoundPage
      title={t("notFoundTitle")}
      description={t("notFoundBody")}
      backHref={reviewer ? "/inbox?type=leave" : "/leave-requests"}
      backLabel={reviewer ? t("issuerOpenInbox") : t("notFoundBackToMine")}
    />
  );
}
