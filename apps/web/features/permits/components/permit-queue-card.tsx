"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Field,
  Button,
  Card,
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { StudentLink } from "../../students/components/student-link";
import { countDays, formatDayRange } from "../lib/permit-dates";
import type { PermitQueueRow } from "../lib/permit-queue";

import { WorkflowStatusBadge } from "./workflow-stepper";

/**
 * One card on the unified queue's bento grid (docs/07-ui-ux.md): student,
 * type + opened time, description, and the workflow status badge. A leave
 * request is always returned by the review-queue endpoint already at the
 * caller's own pending stage (review-queue endpoint comment), so it
 * gets the same one-click Setujui/Tolak as that dedicated queue. Exit
 * permits and late arrivals only ever offer a next step that needs more
 * input (a scan token, a review form), so their card keeps "Tindak
 * lanjuti" as the only action, opening the same detail dialog every row
 * already had.
 */
export function PermitQueueCard({
  row,
  name,
  locale,
  timeZone,
  canReviewLeave,
  selectable,
  selected,
  onToggleSelected,
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
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
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
  // A request at its last stage is completed by issuing the letter, which
  // the review endpoint refuses, so it only opens the detail.
  const awaitingLetter = row.type === "leave" && row.leave.awaiting_letter === true;
  const showLeaveActions = row.type === "leave" && canReviewLeave && !awaitingLetter;
  // A leave card leads with the days it covers, the thing a reviewer
  // approves; the submission time is labelled so it is not read as them.
  const meta =
    row.type === "leave"
      ? [
          t(row.type),
          formatDayRange(row.leave.starts_on, row.leave.ends_on, locale),
          tLeave("days", { count: countDays(row.leave.starts_on, row.leave.ends_on) }),
        ].join(" · ")
      : `${t(row.type)} · ${formatDateTime(row.openedAt, { locale, timeZone })}`;
  const busy = approving || rejecting;

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        {selectable && (
          <Checkbox
            checked={selected}
            disabled={busy}
            onCheckedChange={onToggleSelected}
            aria-label={tLeave("selectRow", { student: name })}
            className="mt-1 shrink-0"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body font-medium text-fg">
            <StudentLink studentId={row.studentId}>{formatDisplayName(name)}</StudentLink>
            {row.className && (
              <span className="ml-1.5 text-body-sm font-normal text-fg-muted">
                ({row.className})
              </span>
            )}
          </span>
          <span className="text-body-sm text-fg-muted">{meta}</span>
          {row.description && <span className="text-body-sm text-fg">{row.description}</span>}
          {row.type === "leave" && (
            <span className="text-caption text-fg-muted">
              {awaitingLetter
                ? tLeave("awaitingLetter")
                : tLeave("submittedAt", {
                    time: formatDateTime(row.openedAt, { locale, timeZone }),
                  })}
            </span>
          )}
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
                  <Field label={tLeave("reviewNote")}>
                    <Textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                      }}
                      maxLength={500}
                    />
                  </Field>
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
        <Button
          size="sm"
          variant={awaitingLetter ? "primary" : "secondary"}
          onClick={onOpenDetail}
          data-queue-open=""
        >
          {awaitingLetter ? tLeave("issueLetter") : t("open")}
        </Button>
      </div>
    </Card>
  );
}
