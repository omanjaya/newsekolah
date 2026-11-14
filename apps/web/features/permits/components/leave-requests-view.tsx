"use client";

import { Button, EmptyState, domainIcons } from "@newsekolah/ui";
import { BellRing, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useQuickAction } from "../../../lib/hooks/use-quick-action";
import { useCan } from "../../../lib/session/session-provider";
import { useCanSubmitPermit } from "../lib/use-can-submit-permit";

import { MyLeaveRequests } from "./my-leave-requests";
import { ReviewInboxBanner } from "./review-inbox-banner";

/**
 * Izin tidak masuk. A student files and follows their own requests; a
 * counselor who only issues letters is told where those requests arrive.
 * Reviewing lives in the Perlu tindakan inbox, so there is no queue here.
 */
export function LeaveRequestsView(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const tNav = useTranslations("app.shell.nav.items");
  const canSubmit = useCanSubmitPermit();
  const canIssueLetter = useCan("issue_leave_letters");
  const [creating, setCreating] = useState(false);
  useQuickAction(
    "submit-leave",
    () => {
      setCreating(true);
    },
    canSubmit,
  );

  return (
    <AppPage
      title={t("title")}
      eyebrow={tNav("permits")}
      primaryAction={
        canSubmit ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("submit")}
          </Button>
        ) : undefined
      }
    >
      {canSubmit ? (
        <MyLeaveRequests
          creating={creating}
          onCreatingChange={setCreating}
          onCreate={() => {
            setCreating(true);
          }}
        />
      ) : canIssueLetter ? (
        <>
          <ReviewInboxBanner />
          <IssuerQueueUnavailable />
        </>
      ) : (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
        />
      )}
    </AppPage>
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
    <EmptyState
      icon={<BellRing aria-hidden="true" />}
      tone="info"
      title={t("issuerQueueUnavailableTitle")}
      description={t("issuerQueueUnavailableBody")}
      action={
        <Button asChild>
          <Link href="/notifications">{t("openNotifications")}</Link>
        </Button>
      }
    />
  );
}
