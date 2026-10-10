"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  StatTile,
  Textarea,
  cn,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Inbox, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { StudentLink } from "../../students/components/student-link";
import {
  useExitPermitReviewQueueQuery,
  useLateArrivalQueueQuery,
  useLeaveReviewQueueQuery,
  useReviewLeaveRequestMutation,
} from "../api";
import { mergePermitQueues, type PermitQueueRow } from "../lib/permit-queue";

import { ApprovePanel, GatePanel } from "./exit-permit-panels";
import { LateArrivalReviewForm } from "./late-arrivals-view";
import { LeaveRequestDetail } from "./leave-request-detail";
import { WorkflowStatusBadge } from "./workflow-stepper";

/** Server-scoped queues only: personal history remains in each service's workflow. */
export function PermitUnifiedQueue(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const tLeave = useTranslations("app.permits.leave");
  const exitQueue = useTranslations("app.permits.exit.queue");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canLeave = useCan("review_leave_requests");
  const canApprove = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const canLate = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const leave = useLeaveReviewQueueQuery(canLeave);
  const exit = useExitPermitReviewQueueQuery(canApprove || canGate);
  const late = useLateArrivalQueueQuery(canLate);
  const directory = useDirectoryQuery("student", canLate);
  const names = useLookup(directory.data?.data);
  const review = useReviewLeaveRequestMutation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PermitQueueRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const sources: {
    type: PermitQueueRow["type"];
    label: string;
    icon: LucideIcon;
    tone: "amber" | "blue" | "purple";
    query: {
      data?: { data: unknown[] };
      isLoading: boolean;
      isError: boolean;
      refetch: () => unknown;
    };
  }[] = [
    ...(canLeave
      ? [
          {
            type: "leave" as const,
            label: t("leave"),
            icon: Inbox,
            tone: "amber" as const,
            query: leave,
          },
        ]
      : []),
    ...(canApprove || canGate
      ? [
          {
            type: "exit" as const,
            label: t("exit"),
            icon: domainIcons.exitPermit,
            tone: "blue" as const,
            query: exit,
          },
        ]
      : []),
    ...(canLate
      ? [
          {
            type: "late" as const,
            label: t("late"),
            icon: domainIcons.late,
            tone: "purple" as const,
            query: late,
          },
        ]
      : []),
  ];
  const rows = mergePermitQueues({
    leave: canLeave ? leave.data?.data : undefined,
    exit: canApprove || canGate ? exit.data?.data : undefined,
    late: canLate ? late.data?.data : undefined,
  });
  const nameFor = (row: PermitQueueRow) =>
    row.studentName.length > 0
      ? row.studentName
      : (names.get(row.studentId)?.name ?? t("unknownStudent"));
  const query = search.trim().toLocaleLowerCase();
  const visible = rows.filter((row) =>
    `${nameFor(row)} ${row.description} ${t(row.type)}`.toLocaleLowerCase().includes(query),
  );
  const loading = sources.some((source) => source.query.isLoading);
  const errors = sources.filter((source) => source.query.isError);
  const tiles = sources.map((source) => ({
    key: source.type,
    icon: source.icon,
    tone: source.tone,
    value: source.query.data?.data.length ?? 0,
    label: source.label,
  }));
  const grid = tileColumns(tiles.length);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function approveLeave(id: string) {
    setPendingId(id);
    review.mutate(
      { id, approve: true },
      {
        onSuccess: () => {
          toast.success(tLeave("approved"));
        },
        onError: fail,
        onSettled: () => {
          setPendingId(null);
        },
      },
    );
  }

  function rejectLeave(id: string, note: string) {
    setPendingId(id);
    review.mutate(
      { id, approve: false, note: note || undefined },
      {
        onSuccess: () => {
          toast.success(tLeave("rejected"));
        },
        onError: fail,
        onSettled: () => {
          setPendingId(null);
        },
      },
    );
  }

  const cells = bentoCells(
    visible.map((row) => ({
      key: `${row.type}-${row.id}`,
      node: (
        <PermitQueueCard
          row={row}
          name={nameFor(row)}
          locale={locale}
          timeZone={me?.tenant.timezone}
          canReviewLeave={canLeave}
          approving={pendingId === row.id && review.variables?.approve === true}
          rejecting={pendingId === row.id && review.variables?.approve === false}
          onApprove={() => {
            approveLeave(row.id);
          }}
          onReject={(reason) => {
            rejectLeave(row.id, reason);
          }}
          onOpenDetail={() => {
            setSelected(row);
          }}
        />
      ),
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-fg-muted">{t("queueHint")}</p>

      {/* A lone count already shows on the queue's own tab, so one tile would only repeat it. */}
      {!loading && tiles.length > 1 && (
        <div className={grid.container} data-testid="permit-queue-tiles">
          {tiles.map((tile, index) => (
            <div
              key={tile.key}
              data-testid={`permit-queue-tile-${tile.key}`}
              className={cn("h-full", index === tiles.length - 1 && grid.lastTileClassName)}
            >
              <StatTile
                className="h-full"
                icon={tile.icon}
                tone={tile.tone}
                value={tile.value}
                label={tile.label}
              />
            </div>
          ))}
        </div>
      )}

      <Input
        aria-label={t("search")}
        placeholder={t("search")}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      {errors.map((source, index) => (
        <section key={`${source.label}-${index}`} aria-label={source.label}>
          <h2 className="text-sm font-medium">{source.label}</h2>
          <QueryError retry={() => source.query.refetch()} />
        </section>
      ))}
      {loading && <Skeleton className="h-24 w-full" aria-busy="true" />}
      {!loading && errors.length === 0 && visible.length === 0 && (
        <p className="py-6 text-center text-sm text-fg-muted">
          {t(rows.length === 0 ? "queueEmpty" : "queueNoMatch")}
        </p>
      )}
      {!loading && errors.length === 0 && visible.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {cells.map((cell) => (
            <li
              key={cell.key}
              className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
            >
              {cell.node}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent title={selected ? t(selected.type) : t("permits")}>
          {selected?.type === "leave" && <LeaveRequestDetail id={selected.id} />}
          {selected?.type === "exit" && selected.status === "in_progress" && canApprove && (
            <ApprovePanel key={selected.id} prefillId={selected.id} />
          )}
          {selected?.type === "exit" &&
            (selected.status !== "in_progress" || !canApprove) &&
            canGate && <GatePanel />}
          {selected?.type === "exit" && selected.status !== "in_progress" && !canGate && (
            <p>{exitQueue("awaitingGate")}</p>
          )}
          {selected?.type === "late" && (
            <LateArrivalReviewForm
              item={selected.late}
              onDone={() => {
                setSelected(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * One card on the unified queue's bento grid (docs/07-ui-ux.md): student,
 * type + opened time, description, and the workflow status badge. A leave
 * request is always returned by the review-queue endpoint already at the
 * caller's own pending stage (leave-review-queue.tsx's own comment), so it
 * gets the same one-click Setujui/Tolak as that dedicated queue. Exit
 * permits and late arrivals only ever offer a next step that needs more
 * input (a scan token, a review form), so their card keeps "Tindak
 * lanjuti" as the only action, opening the same detail dialog every row
 * already had.
 */
function PermitQueueCard({
  row,
  name,
  locale,
  timeZone,
  canReviewLeave,
  approving,
  rejecting,
  onApprove,
  onReject,
  onOpenDetail,
}: {
  row: PermitQueueRow;
  name: string;
  locale: Locale;
  timeZone?: string;
  canReviewLeave: boolean;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onOpenDetail: () => void;
}): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const tLeave = useTranslations("app.permits.leave");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const showLeaveActions = row.type === "leave" && canReviewLeave;
  const busy = approving || rejecting;

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium text-fg">
            <StudentLink studentId={row.studentId}>{formatDisplayName(name)}</StudentLink>
            {row.className && (
              <span className="ml-1.5 text-[13px] font-normal text-fg-muted">
                ({row.className})
              </span>
            )}
          </span>
          <span className="text-[13px] text-fg-muted">
            {t(row.type)} · {formatDateTime(row.openedAt, { locale, timeZone })}
          </span>
          {row.description && <span className="text-[13px] text-fg">{row.description}</span>}
        </div>
        <WorkflowStatusBadge status={row.status} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5">
        {showLeaveActions && (
          <>
            <Button size="sm" disabled={busy} onClick={onApprove}>
              {tLeave("approve")}
            </Button>
            <Popover open={rejectOpen} onOpenChange={setRejectOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary" disabled={busy}>
                  {tLeave("reject")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-[13px]">
                    <span className="font-medium">{tLeave("reviewNote")}</span>
                    <Textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                      }}
                      maxLength={500}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRejectOpen(false);
                      }}
                    >
                      {tLeave("cancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      loading={rejecting}
                      onClick={() => {
                        onReject(reason.trim());
                        setRejectOpen(false);
                        setReason("");
                      }}
                    >
                      {tLeave("reject")}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
        <Button size="sm" variant="secondary" onClick={onOpenDetail}>
          {t("open")}
        </Button>
      </div>
    </Card>
  );
}
