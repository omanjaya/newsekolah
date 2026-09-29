"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Card, Dialog, DialogContent, Skeleton, StatTile, cn } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { useSession } from "../../../lib/session/session-provider";
import { type LeaveRequestSummary, useMyLeaveRequestsQuery } from "../api";
import { buildLeaveMineTiles, countLeaveMineStatuses } from "../lib/leave-mine-tiles";

import { LeaveRequestDetail } from "./leave-request-detail";
import { SubmitForm } from "./leave-request-submit-form";
import { WorkflowMineStageTrack, WorkflowStatusBadge } from "./workflow-stepper";

/**
 * A student's own leave requests as the bento card grid (docs/07-ui-ux.md):
 * four stat tiles for how many are total/in progress/approved/rejected,
 * then every request as a card with its status, category and date range,
 * and a compact horizontal stage track. The "Ajukan izin" action itself
 * lives in the page header (`LeaveRequestsView`); this component only owns
 * the list and the two dialogs it opens (create, view).
 */
export function MyLeaveRequests({
  creating,
  onCreatingChange,
}: {
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading, isError, refetch } = useMyLeaveRequestsQuery();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.data ?? [];

  const tiles = buildLeaveMineTiles(countLeaveMineStatuses(items.map((item) => item.status)));
  const grid = tileColumns(tiles.length);
  const cells = bentoCells(
    items.map((item) => ({
      key: item.instance_id,
      node: (
        <LeaveRequestCard
          item={item}
          locale={locale}
          timeZone={me?.tenant.timezone}
          onOpen={() => {
            setOpenId(item.instance_id);
          }}
        />
      ),
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} />
      ) : items.length === 0 ? (
        <p className="text-[14px] text-fg-muted">{t("emptyBody")}</p>
      ) : (
        <>
          <div className={grid.container} data-testid="leave-mine-tiles">
            {tiles.map((tile, index) => (
              <div
                key={tile.key}
                data-testid={`leave-mine-tile-${tile.key}`}
                className={cn("h-full", index === tiles.length - 1 && grid.lastTileClassName)}
              >
                <StatTile
                  className="h-full"
                  icon={tile.icon}
                  tone={tile.tone}
                  value={tile.value}
                  label={t(`mine.${tile.labelKey}`)}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2" data-testid="leave-mine-cards">
            {cells.map((cell) => (
              <div
                key={cell.key}
                data-testid={`leave-mine-cell-${cell.key}`}
                className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
              >
                <div className="flex-1">{cell.node}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <LeaveRequestFormDialog
        open={creating}
        onOpenChange={onCreatingChange}
        onCreated={(id) => {
          setOpenId(id);
        }}
      />
      <LeaveRequestDetailDialog
        id={openId}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      />
    </div>
  );
}

function LeaveRequestCard({
  item,
  locale,
  timeZone,
  onOpen,
}: {
  item: LeaveRequestSummary;
  locale: Locale;
  timeZone?: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const range = `${formatDate(item.starts_on, { locale, timeZone })} - ${formatDate(item.ends_on, { locale, timeZone })}`;
  const openedText = t("mine.opened", {
    date: formatDate(item.opened_at, { locale, timeZone }),
  });

  return (
    <Card className="h-full">
      <button
        type="button"
        onClick={onOpen}
        data-testid={`leave-mine-card-${item.instance_id}`}
        className="flex h-full w-full flex-col gap-3 rounded-lg p-4 text-left transition-colors hover:bg-bg"
      >
        <div className="flex items-center justify-between gap-2">
          <WorkflowStatusBadge status={item.status} />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-medium text-fg">
            {t(`categories.${item.category}`)} <span className="text-fg-muted">&middot;</span>{" "}
            {range}
          </p>
          <p className="text-[13px] text-fg-muted">
            {openedText}
            {item.letter_number && ` · ${t("letterNumber")}: ${item.letter_number}`}
          </p>
        </div>
        <WorkflowMineStageTrack
          status={item.status}
          currentStageIndex={item.current_stage_index}
          className="pt-1"
        />
      </button>
    </Card>
  );
}

function LeaveRequestFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("submit")}>
        {open && (
          <SubmitForm
            onDone={(id) => {
              onOpenChange(false);
              onCreated(id);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LeaveRequestDetailDialog({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <Dialog open={id !== null} onOpenChange={onOpenChange}>
      <DialogContent title={t("detailTitle")} className="max-w-xl">
        {id && <LeaveRequestDetail id={id} />}
      </DialogContent>
    </Dialog>
  );
}
