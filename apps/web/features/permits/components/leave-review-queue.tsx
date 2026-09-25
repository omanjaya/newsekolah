"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useLeaveReviewQueueQuery, useReviewLeaveRequestMutation } from "../api";

import { QueueRow } from "./leave-queue-row";
import { LeaveRequestDetail } from "./leave-request-detail";

/** The homeroom (or counselor-scoped) review queue: every item is already at the caller's own stage. */
export function ReviewQueue(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading, isError, refetch } = useLeaveReviewQueueQuery();
  const review = useReviewLeaveRequestMutation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const items = data?.data ?? [];

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function approve(id: string) {
    setPendingId(id);
    review.mutate(
      { id, approve: true },
      {
        onSuccess: () => {
          toast.success(t("approved"));
        },
        onError: fail,
        onSettled: () => {
          setPendingId(null);
        },
      },
    );
  }

  function reject(id: string, note: string) {
    setPendingId(id);
    review.mutate(
      { id, approve: false, note: note || undefined },
      {
        onSuccess: () => {
          toast.success(t("rejected"));
        },
        onError: fail,
        onSettled: () => {
          setPendingId(null);
        },
      },
    );
  }

  async function approveSelected() {
    setBulkPending(true);
    let failures = 0;
    for (const id of selected) {
      try {
        await review.mutateAsync({ id, approve: true });
      } catch {
        failures += 1;
      }
    }
    setBulkPending(false);
    setSelected(new Set());
    if (failures === 0) {
      toast.success(t("bulkApproved", { count: selected.size }));
    } else {
      toast.error(t("bulkApprovedPartial", { count: selected.size - failures, failed: failures }));
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("queueEmptyTitle")}
          description={t("queueEmptyBody")}
        />
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/5 px-3 py-2 text-[13px]">
              <span className="font-medium text-fg">
                {t("bulkSelected", { count: selected.size })}
              </span>
              <Button size="sm" loading={bulkPending} onClick={() => void approveSelected()}>
                {t("bulkApprove")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkPending}
                onClick={() => {
                  setSelected(new Set());
                }}
              >
                {t("bulkClear")}
              </Button>
              <span className="w-full text-[12px] text-fg-muted">{t("bulkApproveHint")}</span>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <QueueRow
                key={item.instance_id}
                item={item}
                selectable={items.length > 1}
                selected={selected.has(item.instance_id)}
                onToggleSelected={() => {
                  toggleSelected(item.instance_id);
                }}
                approving={
                  (pendingId === item.instance_id && review.variables?.approve === true) ||
                  bulkPending
                }
                rejecting={
                  (pendingId === item.instance_id && review.variables?.approve === false) ||
                  bulkPending
                }
                onApprove={() => {
                  approve(item.instance_id);
                }}
                onReject={(reason) => {
                  reject(item.instance_id, reason);
                }}
                onOpenDetail={() => {
                  setOpenId(item.instance_id);
                }}
              />
            ))}
          </ul>
        </>
      )}
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent title={t("detailTitle")} className="max-w-xl">
          {openId && <LeaveRequestDetail id={openId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
