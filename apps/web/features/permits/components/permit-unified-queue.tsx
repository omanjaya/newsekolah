"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  Input,
  Select,
  Skeleton,
  StatTile,
  cn,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Inbox, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  useExitPermitReviewQueueQuery,
  useLateArrivalQueueQuery,
  useLeaveReviewQueueQuery,
  useReviewLeaveRequestMutation,
} from "../api";
import { mergePermitQueues, type PermitQueueRow } from "../lib/permit-queue";

import { BulkApproveBar, useBulkLeaveApproval } from "./bulk-leave-approval";
import { ApprovePanel, GatePanel } from "./exit-permit-panels";
import { LateArrivalReviewForm } from "./late-arrivals-view";
import { LeaveRequestDetail } from "./leave-request-detail";
import { PermitQueueCard } from "./permit-queue-card";

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
  // Rows from the late-arrival queue carry no name; look those up.
  const names = useDirectoryNames(
    rows.filter((row) => row.studentName.length === 0).map((row) => row.studentId),
    canLate,
  );
  const nameFor = (row: PermitQueueRow) =>
    row.studentName.length > 0
      ? row.studentName
      : (names.get(row.studentId)?.name ?? t("unknownStudent"));
  const kinds = ["all", ...sources.map((source) => source.type)];
  const [kind, setKind] = useUrlState<string>("type", kinds, "all");
  const classNames = [
    ...new Set(rows.flatMap((row) => (row.className ? [row.className] : []))),
  ].sort((a, b) => a.localeCompare(b));
  const [classFilter, setClassFilter] = useUrlState<string>(
    "class",
    (value) => value === "all" || classNames.includes(value),
    "all",
  );
  const query = search.trim().toLocaleLowerCase();
  const visible = rows.filter(
    (row) =>
      (kind === "all" || row.type === kind) &&
      (classFilter === "all" || row.className === classFilter) &&
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

  const bulk = useBulkLeaveApproval(
    visible.filter((row) => row.type === "leave").map((row) => row.id),
  );
  const selectableLeave = canLeave && visible.filter((row) => row.type === "leave").length > 1;
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
          selectable={selectableLeave && row.type === "leave"}
          selected={bulk.selected.has(row.id)}
          onToggleSelected={() => {
            bulk.toggle(row.id);
          }}
          approving={(pendingId === row.id && review.variables?.approve === true) || bulk.pending}
          rejecting={(pendingId === row.id && review.variables?.approve === false) || bulk.pending}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          className="sm:max-w-sm"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        {classNames.length > 1 && (
          <Select
            aria-label={t("classFilter")}
            value={classFilter}
            onValueChange={setClassFilter}
            className="sm:w-48"
            options={[
              { value: "all", label: t("allClasses") },
              ...classNames.map((name) => ({ value: name, label: name })),
            ]}
          />
        )}
      </div>
      {sources.length > 1 && (
        <div role="group" aria-label={t("typeFilter")} className="flex flex-wrap gap-2">
          {[{ type: "all", label: t("filterAll") }, ...sources].map((source) => (
            <Button
              key={source.type}
              type="button"
              size="sm"
              variant={kind === source.type ? "primary" : "secondary"}
              aria-pressed={kind === source.type}
              onClick={() => {
                setKind(source.type);
              }}
            >
              {source.label}
            </Button>
          ))}
        </div>
      )}
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
      {!loading && errors.length === 0 && visible.length > 0 && <BulkApproveBar bulk={bulk} />}
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
