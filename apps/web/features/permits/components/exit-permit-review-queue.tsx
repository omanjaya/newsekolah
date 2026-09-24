"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, EmptyState, Input, Skeleton, domainIcons } from "@newsekolah/ui";
import { FileBarChart } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
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
  const [search, setSearch] = useState("");
  const items = useMemo(() => queue.data?.data ?? [], [queue.data]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => (item.student_name ?? "").toLowerCase().includes(query));
  }, [items, search]);

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

      {items.length > 0 && (
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full sm:w-64"
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : visibleItems.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleItems.map((item) => (
            <li
              key={item.instance_id}
              className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface px-4 py-2.5 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-fg">
                  {item.student_name ? formatDisplayName(item.student_name) : t("unknownStudent")}
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
