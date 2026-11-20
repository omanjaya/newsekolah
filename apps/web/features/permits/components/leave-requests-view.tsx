"use client";

import { Button, EmptyState, TextLink, domainIcons } from "@newsekolah/ui";
import { Inbox, Plus } from "lucide-react";
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
 * The h1 is the area's label and the eyebrow its sidebar group, from the
 * template, the same on every tab; the tab names the browser tab.
 */
export function LeaveRequestsView(): ReactElement {
  const t = useTranslations("app.permits.leave");
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
      documentTitle={!canSubmit && canIssueLetter ? t("issuerTitle") : undefined}
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
      primaryActionCompact={
        canSubmit
          ? {
              icon: <Plus />,
              label: t("submit"),
              onSelect: () => {
                setCreating(true);
              },
            }
          : undefined
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
          <IssuerQueueLink />
        </>
      ) : (
        <EmptyState
          icon={<domainIcons.leave aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
        />
      )}
    </AppPage>
  );
}

/**
 * Shown to a user who issues letters (issue_leave_letters): the requests
 * waiting at their stage are in the inbox's leave queue (the review-queue
 * endpoint lists them for an issuer as well as for a reviewer), so that is
 * the way forward; the notifications are a quiet second link.
 */
function IssuerQueueLink(): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <EmptyState
      // The icon of where the main action leads: the inbox's leave queue
      // (its "Perlu tindakan" nav icon).
      icon={<Inbox aria-hidden="true" />}
      tone="info"
      title={t("issuerTitle")}
      description={t("issuerQueueInboxBody")}
      action={
        <div className="flex flex-col items-center gap-3">
          <Button asChild>
            <Link href="/inbox?type=leave">{t("issuerOpenInbox")}</Link>
          </Button>
          <TextLink href="/notifications">{t("openNotifications")}</TextLink>
        </div>
      }
    />
  );
}
