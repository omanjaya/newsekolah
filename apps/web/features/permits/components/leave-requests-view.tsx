"use client";

import { Alert, Button, EmptyState, PageHeader, domainIcons } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useQuickAction } from "../../../lib/hooks/use-quick-action";
import { useCan } from "../../../lib/session/session-provider";

import { MyLeaveRequests } from "./my-leave-requests";

/**
 * The submitter's request form plus history. Reviewing lives in the Perlu
 * Tindakan inbox, so there is no queue tab here; a counselor who only issues
 * letters is told where their requests arrive.
 */
export function LeaveRequestsView({ embedded = false }: { embedded?: boolean } = {}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const canSubmit = useCan("submit_leave_requests");
  const canIssueLetter = useCan("issue_leave_letters");
  const [creating, setCreating] = useState(false);
  useQuickAction(
    "submit-leave",
    () => {
      setCreating(true);
    },
    canSubmit,
  );

  const headerActions = canSubmit ? (
    <Button
      size="sm"
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t("submit")}
    </Button>
  ) : undefined;

  return (
    <div className={embedded ? "flex flex-col gap-6" : "flex flex-col gap-6 p-4 md:p-6"}>
      {embedded ? (
        headerActions && <div className="flex justify-end">{headerActions}</div>
      ) : (
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} actions={headerActions} />
      )}
      {canSubmit ? (
        <MyLeaveRequests creating={creating} onCreatingChange={setCreating} />
      ) : canIssueLetter ? (
        <IssuerQueueUnavailable />
      ) : (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
        />
      )}
    </div>
  );
}

/**
 * Shown to a user who can issue letters (issue_leave_letters) but cannot
 * list the review queue (review_leave_requests): the API endpoint behind the
 * queue only authorizes reviewers, so fetching it would just surface a 403.
 * The counselor acts on a request by opening the notification sent when the
 * homeroom teacher approves it, which links to /leave-requests/{instanceId}.
 */
function IssuerQueueUnavailable(): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <Alert variant="info" title={t("issuerQueueUnavailableTitle")}>
      <p>{t("issuerQueueUnavailableBody")}</p>
      <Link
        href="/notifications"
        className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-2"
      >
        {t("openNotifications")}
      </Link>
    </Alert>
  );
}
