"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, EmptyState, Skeleton, domainIcons } from "@newsekolah/ui";
import { FileBarChart } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useExitPermitReviewQueueQuery } from "../api";

import { WorkflowStatusBadge } from "./workflow-stepper";

/**
 * Everyone who handles exit permits (approvers and the security gate)
 * shares one queue: the API already scopes it to whichever stage the
 * caller's role covers, so a counselor sees permits awaiting their
 * approval and security sees permits approved and awaiting a gate scan.
 */
export function ExitPermitReviewQueue({
  canApprove,
  canGate,
  onProcess,
}: {
  canApprove: boolean;
  canGate: boolean;
  onProcess: (instanceId: string) => void;
}): ReactElement {
  const t = useTranslations("app.permits.exit.queue");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  // The yearly report lives in the report centre, which needs view_reports;
  // a homeroom approver without it would land on a no-access page.
  const canViewReports = useCan("view_reports");
  const queue = useExitPermitReviewQueueQuery();
  const items = queue.data?.data ?? [];

  if (queue.isLoading) {
    return <Skeleton className="h-40 w-full" aria-busy="true" />;
  }
  if (queue.isError && !queue.data) {
    return <QueryError retry={() => queue.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {canApprove && canViewReports && (
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/reports">
              <FileBarChart className="size-4" aria-hidden="true" />
              {t("yearlyReportLink")}
            </Link>
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.instance_id}
              className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-medium text-fg">
                  {item.student_name ?? t("unknownStudent")}
                  {item.class_name && (
                    <span className="ml-1.5 text-[13px] font-normal text-fg-muted">
                      ({item.class_name})
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-fg-muted">
                  {item.destination} ·{" "}
                  {formatDateTime(item.opened_at, { locale, timeZone: me?.tenant.timezone })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <WorkflowStatusBadge status={item.status} />
                {item.status === "in_progress" && canApprove && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onProcess(item.instance_id);
                    }}
                  >
                    {t("process")}
                  </Button>
                )}
                {item.status === "approved" && canGate && (
                  <span className="text-[13px] text-fg-muted">{t("awaitingGate")}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
