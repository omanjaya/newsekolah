"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, Card, Input, StatTile, Skeleton, cn, domainIcons } from "@newsekolah/ui";
import { FileBarChart } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import type { useExitPermitReviewQueueQuery } from "../api";
import { buildExitPermitQueueTiles } from "../lib/exit-permit-queue-tiles";

import { WorkflowStatusBadge } from "./workflow-stepper";

type ExitPermitReviewQueueQueryResult = ReturnType<typeof useExitPermitReviewQueueQuery>;

/**
 * Everyone who handles exit permits (approvers and the security gate)
 * shares one queue: the API already scopes it to whichever stage the
 * caller's role covers, so a counselor sees permits awaiting their
 * approval and security sees permits approved and awaiting a gate scan.
 * `queue` is fetched once by the parent view (which also needs the count
 * for its tab label) and passed down here, rather than re-queried, so the
 * realtime subscription in the query hook only ever fires once.
 */
export function ExitPermitReviewQueue({
  queue,
  canApprove,
  canGate,
  onProcess,
}: {
  queue: ExitPermitReviewQueueQueryResult;
  canApprove: boolean;
  canGate: boolean;
  onProcess: (instanceId: string) => void;
}): ReactElement {
  const t = useTranslations("app.permits.exit.queue");
  const tReview = useTranslations("app.permits.review");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  // The yearly report lives in the report centre, which needs view_reports;
  // a homeroom approver without it would land on a no-access page.
  const canViewReports = useCan("view_reports");
  const [search, setSearch] = useState("");
  const items = useMemo(() => queue.data?.data ?? [], [queue.data]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => (item.student_name ?? "").toLowerCase().includes(query));
  }, [items, search]);
  const tiles = useMemo(
    () => buildExitPermitQueueTiles(items, canApprove, canGate),
    [items, canApprove, canGate],
  );
  const grid = tileColumns(tiles.length);
  const cells = bentoCells(
    visibleItems.map((item) => ({
      key: item.instance_id,
      node: (
        <Card className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[14px] font-medium text-fg">
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
            <WorkflowStatusBadge status={item.status} />
          </div>
          <div className="mt-auto flex justify-end">
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
        </Card>
      ),
    })),
  );

  if (queue.isLoading) {
    return <Skeleton className="h-40 w-full" aria-busy="true" />;
  }
  if (queue.isError && !queue.data) {
    return <QueryError retry={() => queue.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {tiles.length > 0 && (
        <div className={grid.container} data-testid="exit-permit-queue-tiles">
          {tiles.map((tile, index) => (
            <div
              key={tile.key}
              data-testid={`exit-permit-queue-tile-${tile.key}`}
              className={cn("h-full", index === tiles.length - 1 && grid.lastTileClassName)}
            >
              <StatTile
                className="h-full"
                icon={tile.icon}
                tone={tile.tone}
                value={tile.value}
                label={tReview(tile.labelKey)}
              />
            </div>
          ))}
        </div>
      )}

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
        <p className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-fg-muted">
          <domainIcons.exitPermit className="size-4 shrink-0" aria-hidden="true" />
          {t("emptyBody")}
        </p>
      ) : visibleItems.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2" data-testid="exit-permit-queue-cards">
          {cells.map((cell) => (
            <li
              key={cell.key}
              data-testid={`exit-permit-queue-card-${cell.key}`}
              className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
            >
              {cell.node}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
