"use client";

import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useLeaveReviewQueueQuery } from "../api";

import { ReviewQueue } from "./leave-review-queue";
import { MyLeaveRequests } from "./my-leave-requests";

export function LeaveRequestsView(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const tReview = useTranslations("app.permits.review");
  const canSubmit = useCan("submit_leave_requests");
  const canReviewStage = useCan("review_leave_requests");
  const canIssueLetter = useCan("issue_leave_letters");
  // GET /v1/leave-requests/review-queue is authorized for
  // review_leave_requests only; a counselor holding issue_leave_letters
  // alone would get a 403, so the queue is only fetched for reviewers.
  // Issuers still get the tab, explaining where their requests arrive.
  const showQueueTab = canReviewStage || canIssueLetter;
  const [creating, setCreating] = useState(false);
  // Same cached query ReviewQueue reads (live topics are ref-counted), so the
  // tab can carry the queue's count without a second request.
  const reviewQueue = useLeaveReviewQueueQuery(canReviewStage);
  const queueCount = reviewQueue.data?.data.length;

  const tabs = [
    showQueueTab && {
      value: "queue",
      label:
        queueCount === undefined
          ? t("tabQueue")
          : tReview("tabWithCount", { label: t("tabQueue"), count: queueCount }),
      content: canReviewStage ? <ReviewQueue /> : <IssuerQueueUnavailable />,
    },
    canSubmit && {
      value: "mine",
      label: t("tabMine"),
      content: <MyLeaveRequests creating={creating} onCreatingChange={setCreating} />,
    },
  ].filter((entry): entry is { value: string; label: string; content: ReactElement } =>
    Boolean(entry),
  );
  const [tab, setTab] = useUrlState<string>(
    "tab",
    tabs.map((item) => item.value),
    tabs[0]?.value ?? "mine",
  );

  // Radix's `TabsContent` unmounts an inactive tab, so the button that
  // opens `MyLeaveRequests`' create dialog only renders in the header
  // while that tab (or the only tab there is) is actually on screen.
  const showHeaderSubmit = canSubmit && (tabs.length <= 1 || tab === "mine");
  const headerActions = showHeaderSubmit ? (
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
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} actions={headerActions} />
      {tabs.length > 1 ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {tabs.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((entry) => (
            <TabsContent key={entry.value} value={entry.value} className="pt-4">
              {entry.content}
            </TabsContent>
          ))}
        </Tabs>
      ) : tabs.length === 1 ? (
        tabs[0]?.content
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
 * Shown instead of ReviewQueue to a user who can issue letters
 * (issue_leave_letters) but cannot list the queue (review_leave_requests):
 * the API endpoint behind the queue only authorizes reviewers, so fetching
 * it here would just surface a 403. The counselor acts on a request by
 * opening the notification sent when the homeroom teacher approves it,
 * which links to /leave-requests/{instanceId}.
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
