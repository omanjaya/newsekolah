"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Dialog,
  DialogContent,
  EmptyState,
  SearchInput,
  SectionHeader,
  SegmentedControl,
  Select,
  SkeletonList,
  cn,
  useToast,
  type ReturnFocusFallback,
} from "@newsekolah/ui";
import { Inbox } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { bentoCells } from "../../../lib/layout/bento";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  useExitPermitReviewQueueQuery,
  useLateArrivalQueueQuery,
  useLeaveReviewQueueQuery,
  useReviewLeaveRequestMutation,
} from "../api";
import { mergePermitQueues, type PermitQueueRow } from "../lib/permit-queue";

import { ApprovePanel } from "./approve-panel";
import { BulkApproveBar, useBulkLeaveApproval } from "./bulk-leave-approval";
import { GatePanel } from "./exit-permit-panels";
import { LateArrivalReviewForm } from "./late-arrivals-view";
import { LeaveRequestDetail } from "./leave-request-detail";
import { PermitQueueCard } from "./permit-queue-card";

/**
 * Server-scoped queues only: personal history remains in each service's workflow.
 *
 * `onSheetOpenChange` tells the host when a row's sheet opens and closes.
 * The sheet keeps its row in local state, so a refetch that drops the row
 * (the stage it approves has passed) leaves it open; a host that swaps the
 * whole queue out when nothing is left waiting (the inbox's all-clear)
 * waits for the sheet to close, so its success line can be read. The
 * close is reported once the sheet has finished sliding out, so the swap
 * never cuts its animation short (audit r6-n15), and the sheet keeps its
 * row's title and body while it animates closed (audit r6-n14).
 *
 * When the sheet closes after its row left the queue (the approval it
 * showed went through), focus moves to the next row's "Tindak lanjuti",
 * or, with no row left, to `returnFocusFallback`: the host's heading or
 * whatever it swapped the queue for.
 */
export function PermitUnifiedQueue({
  onSheetOpenChange,
  returnFocusFallback,
}: {
  onSheetOpenChange?: (open: boolean) => void;
  returnFocusFallback?: ReturnFocusFallback;
} = {}): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const tLeave = useTranslations("app.permits.leave");
  const tLate = useTranslations("app.permits.late");
  const tApprove = useTranslations("app.permits.approve");
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
  // The sheet's row stays after the sheet starts closing, so its title
  // and body do not blank while it animates out; `sheetOpen` alone says
  // whether it is up.
  const [selected, setSelected] = useState<PermitQueueRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Where the open sheet's row sat in the list, so focus can land on the
  // row that takes its place once the row is gone.
  const selectedIndex = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  const openSheet = (row: PermitQueueRow, index: number) => {
    selectedIndex.current = index;
    setSelected(row);
    setSheetOpen(true);
    onSheetOpenChange?.(true);
  };
  // Closing keeps the row and the opener's position until focus has moved.
  const closeSelected = () => {
    setSheetOpen(false);
  };
  // Radix runs this once the sheet has animated out and unmounted, just
  // before focus is placed. The host may swap the queue out now (the
  // inbox's all-clear), and does so at once, so the focus fallback below
  // finds what replaced the queue.
  const afterSheetClosed = () => {
    flushSync(() => {
      setSelected(null);
      onSheetOpenChange?.(false);
    });
  };
  const [pendingId, setPendingId] = useState<string | null>(null);
  const sources: {
    type: PermitQueueRow["type"];
    label: string;
    query: {
      data?: { data: unknown[] };
      isLoading: boolean;
      isError: boolean;
      refetch: () => unknown;
    };
  }[] = [
    ...(canLeave ? [{ type: "leave" as const, label: t("leave"), query: leave }] : []),
    ...(canApprove || canGate ? [{ type: "exit" as const, label: t("exit"), query: exit }] : []),
    ...(canLate ? [{ type: "late" as const, label: t("late"), query: late }] : []),
  ];
  const rows = mergePermitQueues({
    leave: canLeave ? leave.data?.data : undefined,
    exit: canApprove || canGate ? exit.data?.data : undefined,
    late: canLate ? late.data?.data : undefined,
  });
  // Rows from the late-arrival queue carry no name; look those up. The open
  // sheet's student stays in the lookup after a refetch drops the row (its
  // stage was approved), so the sheet goes on naming them.
  const names = useDirectoryNames(
    [...rows, ...(selected ? [selected] : [])]
      .filter((row) => row.studentName.length === 0)
      .map((row) => row.studentId),
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

  // A row whose sheet shows this approver's stage QR: the sheet is titled
  // with the stage and names the student (and class) before the QR, as the
  // duty desk's does.
  const selectedApproval =
    selected?.type === "late" && selected.late.current_stage.verification === "qr_scan"
      ? { kind: "late_arrival" as const, stage: selected.late.current_stage.label }
      : selected?.type === "exit" && selected.status === "in_progress" && canApprove
        ? { kind: "exit_permit" as const, stage: selected.exit.current_stage?.label }
        : null;
  // The opener left with its row: the row now in its place, else the last.
  const focusAfterSheet = () => {
    const openers = listRef.current?.querySelectorAll<HTMLElement>("[data-queue-open]");
    const next = openers?.[Math.min(selectedIndex.current, openers.length - 1)];
    return next ?? returnFocusFallback?.();
  };
  // A late arrival at the picket review takes the review form, titled and
  // naming the student (and class) as the duty desk's review sheet is.
  const selectedLateReview =
    selected?.type === "late" && selected.late.current_stage.verification !== "qr_scan";

  const bulk = useBulkLeaveApproval(
    visible.filter((row) => row.type === "leave").map((row) => row.id),
  );
  const selectableLeave = canLeave && visible.filter((row) => row.type === "leave").length > 1;
  const cells = bentoCells(
    visible.map((row, index) => ({
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
            openSheet(row, index);
          }}
        />
      ),
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* One row of tools above the requests: the search, the class and,
          for a reader of several queues, the kind as one segmented filter
          that carries each queue's count (no tiles repeating the same
          three numbers). On a phone they stack, the filter one scrolling
          row with fades. */}
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          size="sm"
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          className="sm:max-w-sm sm:flex-1"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          onClear={() => {
            setSearch("");
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
        {sources.length > 1 && (
          <SegmentedControl
            size="sm"
            fullWidth="phone"
            aria-label={t("typeFilter")}
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "all", label: t("filterAll") },
              ...sources.map((source) => ({
                value: source.type,
                label: source.label,
                count: source.query.data?.data.length,
              })),
            ]}
          />
        )}
      </div>
      {errors.map((source, index) => (
        <section
          key={`${source.label}-${index}`}
          aria-label={source.label}
          className="flex flex-col gap-2"
        >
          <SectionHeader title={source.label} as="h3" />
          <QueryError retry={() => source.query.refetch()} />
        </section>
      ))}
      {loading && <SkeletonList rows={3} leading />}
      {!loading && errors.length === 0 && visible.length === 0 && (
        <EmptyState
          variant="compact"
          icon={<Inbox aria-hidden="true" />}
          title={t(rows.length === 0 ? "queueEmpty" : "queueNoMatch")}
        />
      )}
      {!loading && errors.length === 0 && visible.length > 0 && <BulkApproveBar bulk={bulk} />}
      {!loading && errors.length === 0 && visible.length > 0 && (
        <ul ref={listRef} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSelected();
        }}
      >
        <DialogContent
          onCloseAutoFocus={afterSheetClosed}
          returnFocusFallback={focusAfterSheet}
          title={
            selectedApproval
              ? selectedApproval.stage
                ? tApprove("titleStage", { stage: selectedApproval.stage })
                : tApprove("title")
              : selectedLateReview
                ? tLate("reviewTitle")
                : selected
                  ? t(selected.type)
                  : t("permits")
          }
          description={
            selected && (selectedApproval || selectedLateReview)
              ? [nameFor(selected), selected.className].filter(Boolean).join(" · ")
              : undefined
          }
        >
          {selected?.type === "leave" && <LeaveRequestDetail id={selected.id} />}
          {selected && selectedApproval && (
            <ApprovePanel
              key={selected.id}
              kind={selectedApproval.kind}
              instanceId={selected.id}
              onApproved={closeSelected}
            />
          )}
          {selected?.type === "exit" &&
            (selected.status !== "in_progress" || !canApprove) &&
            canGate && <GatePanel />}
          {selected?.type === "exit" && selected.status !== "in_progress" && !canGate && (
            <p>{exitQueue("awaitingGate")}</p>
          )}
          {/* A late arrival past its picket review waits for this
              approver's own QR (leadership, the class teacher), above;
              at the picket review it takes the review form. */}
          {selected?.type === "late" && selectedLateReview && (
            <LateArrivalReviewForm item={selected.late} onDone={closeSelected} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
