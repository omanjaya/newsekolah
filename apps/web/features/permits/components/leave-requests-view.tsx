"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  type LeaveRequestSummary,
  useGuardianLeaveQueueQuery,
  useLeaveReviewQueueQuery,
  useMyLeaveRequestsQuery,
} from "../api";

import { LeaveRequestDetail, SubmitForm } from "./leave-request-detail";
import { WorkflowStatusBadge } from "./workflow-stepper";

export function LeaveRequestsView(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const canSubmit = useCan("submit_leave_requests");
  const canReviewStage = useCan("review_leave_requests");
  const canIssueLetter = useCan("issue_leave_letters");
  const canApproveAsGuardian = useCan("approve_child_leave_requests");
  // GET /v1/leave-requests/review-queue is authorized for
  // review_leave_requests only; a counselor holding issue_leave_letters
  // alone would get a 403, so the queue is only fetched for reviewers.
  // Issuers still get the tab, explaining where their requests arrive.
  const showQueueTab = canReviewStage || canIssueLetter;

  const tabs = [
    showQueueTab && {
      value: "queue",
      label: t("tabQueue"),
      content: canReviewStage ? <ReviewQueue /> : <IssuerQueueUnavailable />,
    },
    canApproveAsGuardian && {
      value: "guardianQueue",
      label: t("tabGuardianQueue"),
      content: <GuardianQueue />,
    },
    canSubmit && { value: "mine", label: t("tabMine"), content: <MyLeaveRequests /> },
  ].filter((entry): entry is { value: string; label: string; content: ReactElement } =>
    Boolean(entry),
  );
  const [tab, setTab] = useUrlState<string>(
    "tab",
    tabs.map((item) => item.value),
    tabs[0]?.value ?? "mine",
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
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

function SummaryRow({
  item,
  onOpen,
  nameFirst,
}: {
  item: LeaveRequestSummary;
  onOpen: () => void;
  nameFirst: boolean;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const range = `${formatDate(item.starts_on, { locale, timeZone: me?.tenant.timezone })} - ${formatDate(item.ends_on, { locale, timeZone: me?.tenant.timezone })}`;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 rounded-sm border border-border bg-surface px-4 py-3 text-left hover:bg-bg"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-medium text-fg">
            {nameFirst
              ? `${item.student_name} (${item.class_name})`
              : t(`categories.${item.category}`)}
          </span>
          <span className="text-[13px] text-fg-muted">
            {nameFirst ? `${t(`categories.${item.category}`)} · ${range}` : range}
          </span>
          {item.letter_number && (
            <span className="text-[12px] text-fg-muted">
              {t("letterNumber")}: {item.letter_number}
            </span>
          )}
        </div>
        <WorkflowStatusBadge status={item.status} />
      </button>
    </li>
  );
}

function MyLeaveRequests(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const { data, isLoading, isError, refetch } = useMyLeaveRequestsQuery();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setCreating(true);
          }}
        >
          {t("submit")}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <SummaryRow
              key={item.instance_id}
              item={item}
              nameFirst={false}
              onOpen={() => {
                setOpenId(item.instance_id);
              }}
            />
          ))}
        </ul>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("submit")}>
          {creating && (
            <SubmitForm
              onDone={(id) => {
                setCreating(false);
                setOpenId(id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent title={t("detailTitle")} className="max-w-xl">
          {openId && <LeaveRequestDetail id={openId} />}
        </DialogContent>
      </Dialog>
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

function ReviewQueue(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const { data, isLoading, isError, refetch } = useLeaveReviewQueueQuery();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("queueEmptyTitle")}
          description={t("queueEmptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <SummaryRow
              key={item.instance_id}
              item={item}
              nameFirst
              onOpen={() => {
                setOpenId(item.instance_id);
              }}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent title={t("detailTitle")} className="max-w-xl">
          {openId && <LeaveRequestDetail id={openId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A guardian's queue: their children's requests awaiting their decision. */
function GuardianQueue(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const { data, isLoading, isError, refetch } = useGuardianLeaveQueueQuery();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("guardian.queueEmptyTitle")}
          description={t("guardian.queueEmptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <SummaryRow
              key={item.instance_id}
              item={item}
              nameFirst
              onOpen={() => {
                setOpenId(item.instance_id);
              }}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent title={t("detailTitle")} className="max-w-xl">
          {openId && <LeaveRequestDetail id={openId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
