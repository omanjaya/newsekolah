"use client";

import { ApiError } from "@newsekolah/api-client";
import { Dialog, DialogContent, EmptyState, Skeleton, domainIcons, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGuardianLeaveQueueQuery, useReviewLeaveRequestAsGuardianMutation } from "../api";

import { QueueRow } from "./leave-queue-row";
import { LeaveRequestDetail } from "./leave-request-detail";

/** A guardian's queue: their children's requests awaiting their decision. */
export function GuardianQueue(): ReactElement {
  const t = useTranslations("app.permits.leave");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading, isError, refetch } = useGuardianLeaveQueueQuery();
  const review = useReviewLeaveRequestAsGuardianMutation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
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
          toast.success(t("guardian.approved"));
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
      { id, approve: false, note },
      {
        onSuccess: () => {
          toast.success(t("guardian.rejected"));
        },
        onError: fail,
        onSettled: () => {
          setPendingId(null);
        },
      },
    );
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
          title={t("guardian.queueEmptyTitle")}
          description={t("guardian.queueEmptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <QueueRow
              key={item.instance_id}
              item={item}
              selectable={false}
              selected={false}
              onToggleSelected={() => undefined}
              approving={pendingId === item.instance_id && review.variables?.approve === true}
              rejecting={pendingId === item.instance_id && review.variables?.approve === false}
              rejectReasonRequired
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
