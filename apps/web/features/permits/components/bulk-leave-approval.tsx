"use client";

import { Button, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useReviewLeaveRequestMutation } from "../api";

export interface BulkLeaveApproval {
  selected: ReadonlySet<string>;
  pending: boolean;
  toggle: (id: string) => void;
  clear: () => void;
  approveSelected: () => Promise<void>;
}

/**
 * Checkbox selection over leave requests and "approve selected": each id is
 * approved in turn, and a partial failure reports how many went through.
 * Only requests still on screen count as selected, so a filter that hides a
 * ticked request also takes it out of "approve selected" -- the reader never
 * approves something they can no longer see.
 */
export function useBulkLeaveApproval(visibleIds: readonly string[]): BulkLeaveApproval {
  const t = useTranslations("app.permits.leave");
  const toast = useToast();
  const review = useReviewLeaveRequestMutation();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const visible = new Set(visibleIds);
  const selected: ReadonlySet<string> = new Set([...ticked].filter((id) => visible.has(id)));

  async function approveSelected() {
    setPending(true);
    let failures = 0;
    for (const id of selected) {
      try {
        await review.mutateAsync({ id, approve: true });
      } catch {
        failures += 1;
      }
    }
    setPending(false);
    setTicked(new Set());
    if (failures === 0) {
      toast.success(t("bulkApproved", { count: selected.size }));
    } else {
      toast.error(t("bulkApprovedPartial", { count: selected.size - failures, failed: failures }));
    }
  }

  return {
    selected,
    pending,
    toggle: (id) => {
      setTicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    clear: () => {
      setTicked(new Set());
    },
    approveSelected,
  };
}

export function BulkApproveBar({ bulk }: { bulk: BulkLeaveApproval }): ReactElement | null {
  const t = useTranslations("app.permits.leave");
  if (bulk.selected.size === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/5 px-3 py-2 text-[13px]">
      <span className="font-medium text-fg">
        {t("bulkSelected", { count: bulk.selected.size })}
      </span>
      <Button size="sm" loading={bulk.pending} onClick={() => void bulk.approveSelected()}>
        {t("bulkApprove")}
      </Button>
      <Button size="sm" variant="secondary" disabled={bulk.pending} onClick={bulk.clear}>
        {t("bulkClear")}
      </Button>
      <span className="w-full text-[12px] text-fg-muted">{t("bulkApproveHint")}</span>
    </div>
  );
}
