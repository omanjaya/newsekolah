"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, Card, Popover, PopoverContent, PopoverTrigger, Textarea } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { StudentLink } from "../../students/components/student-link";
import type { PermitQueueRow } from "../lib/permit-queue";

import { WorkflowStatusBadge } from "./workflow-stepper";

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
export function PermitQueueCard({
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
