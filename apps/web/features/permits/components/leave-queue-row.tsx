"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Button,
  Checkbox,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from "@newsekolah/ui";
import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import type { LeaveRequestSummary } from "../api";

/**
 * A quick-decision row shared by the homeroom queue and the guardian
 * queue: every item returned by either endpoint is already scoped to the
 * caller's own pending stage (see the queries' comments), so "Setujui" acts
 * immediately and "Tolak" only needs a small reason prompt -- neither has
 * to open the full detail dialog for the common case. The row body still
 * opens that dialog, for the times a reviewer wants the full context
 * (evidence, letter, prior notes) before deciding.
 */
export function QueueRow({
  item,
  selectable,
  selected,
  onToggleSelected,
  approving,
  rejecting,
  onApprove,
  onReject,
  rejectReasonRequired,
  onOpenDetail,
}: {
  item: LeaveRequestSummary;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  rejectReasonRequired: boolean;
  onOpenDetail: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const range = `${formatDate(item.starts_on, { locale, timeZone: me?.tenant.timezone })} - ${formatDate(item.ends_on, { locale, timeZone: me?.tenant.timezone })}`;
  const busy = approving || rejecting;

  return (
    <li className="flex items-start gap-2 rounded-sm border border-border bg-surface px-4 py-2.5">
      {selectable && (
        <Checkbox
          checked={selected}
          disabled={busy}
          onCheckedChange={onToggleSelected}
          aria-label={t("selectRow", { student: item.student_name })}
          className="mt-1 shrink-0"
        />
      )}
      <button
        type="button"
        onClick={onOpenDetail}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span className="truncate text-[14px] font-medium text-fg">
          {formatDisplayName(item.student_name)}{" "}
          <span className="font-normal text-fg-muted">({item.class_name})</span>
        </span>
        <span className="text-[13px] text-fg-muted">
          {t(`categories.${item.category}`)} · {range}
        </span>
        {item.reason && <span className="truncate text-[13px] text-fg">{item.reason}</span>}
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton
          icon={<Check />}
          aria-label={t("approve")}
          variant="outline"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onApprove();
          }}
        />
        <Popover open={rejectOpen} onOpenChange={setRejectOpen}>
          <PopoverTrigger asChild>
            <IconButton
              icon={<X />}
              aria-label={t("reject")}
              variant="outline"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">
                  {rejectReasonRequired ? t("guardian.reviewNote") : t("reviewNote")}
                </span>
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setReasonError(false);
                  }}
                  maxLength={500}
                />
              </label>
              {reasonError && (
                <p role="alert" className="text-[12px] text-status-absent">
                  {t("guardian.reasonRequired")}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRejectOpen(false);
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={rejecting}
                  onClick={() => {
                    const trimmed = reason.trim();
                    if (rejectReasonRequired && !trimmed) {
                      setReasonError(true);
                      return;
                    }
                    onReject(trimmed);
                    setRejectOpen(false);
                    setReason("");
                  }}
                >
                  {t("reject")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </li>
  );
}
