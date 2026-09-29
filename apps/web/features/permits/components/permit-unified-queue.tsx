"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, Dialog, DialogContent, Input, Skeleton } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  useExitPermitReviewQueueQuery,
  useLateArrivalQueueQuery,
  useLeaveReviewQueueQuery,
} from "../api";
import { mergePermitQueues, type PermitQueueRow } from "../lib/permit-queue";

import { ApprovePanel, GatePanel } from "./exit-permit-panels";
import { LateArrivalReviewForm } from "./late-arrivals-view";
import { LeaveRequestDetail } from "./leave-request-detail";
import { WorkflowStatusBadge } from "./workflow-stepper";

/** Server-scoped queues only: personal history remains in each service's workflow. */
export function PermitUnifiedQueue(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const exitQueue = useTranslations("app.permits.exit.queue");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const canLeave = useCan("review_leave_requests");
  const canApprove = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const canLate = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const leave = useLeaveReviewQueueQuery(canLeave);
  const exit = useExitPermitReviewQueueQuery(canApprove || canGate);
  const late = useLateArrivalQueueQuery(canLate);
  const directory = useDirectoryQuery("student", canLate);
  const names = useLookup(directory.data?.data);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PermitQueueRow | null>(null);
  const sources = [
    ...(canLeave ? [{ label: t("leave"), query: leave }] : []),
    ...(canApprove || canGate ? [{ label: t("exit"), query: exit }] : []),
    ...(canLate ? [{ label: t("late"), query: late }] : []),
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

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-fg-muted">{t("queueHint")}</p>
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
      <ul className="flex flex-col gap-2">
        {visible.map((row) => (
          <li
            key={`${row.type}-${row.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface p-4"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">{nameFor(row)}</span>
              <span className="text-xs text-fg-muted">
                {t(row.type)} ·{" "}
                {formatDateTime(row.openedAt, { locale, timeZone: me?.tenant.timezone })}
              </span>
              {row.description && <span className="text-sm">{row.description}</span>}
            </div>
            <div className="flex items-center gap-3">
              <WorkflowStatusBadge status={row.status} />
              <Button
                size="sm"
                onClick={() => {
                  setSelected(row);
                }}
              >
                {t("open")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
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
