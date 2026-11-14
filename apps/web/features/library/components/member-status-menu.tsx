"use client";

import { ApiError } from "@newsekolah/api-client";
import { ConfirmDialog, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryMemberStatus, useUpdateLibraryMemberStatusMutation } from "../members-api";

const CHANGEABLE_STATUSES: LibraryMemberStatus[] = ["pending", "active", "inactive", "suspended"];

/**
 * The membership status as a select that asks before it changes anything:
 * a status decides whether the member may borrow, so the new one is named
 * in a confirmation first. "Cleared" is left out; only the clearance
 * action sets it.
 */
export function MemberStatusMenu({
  userId,
  status,
  memberName,
}: {
  userId: string;
  status: LibraryMemberStatus;
  memberName: string;
}): ReactElement {
  const t = useTranslations("app.library.members");
  const tDetail = useTranslations("app.library.memberDetail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const updateStatus = useUpdateLibraryMemberStatusMutation();
  const [next, setNext] = useState<LibraryMemberStatus | null>(null);

  return (
    <>
      <Select
        options={CHANGEABLE_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        value={CHANGEABLE_STATUSES.includes(status) ? status : undefined}
        placeholder={t(`status.${status}`)}
        disabled={updateStatus.isPending}
        onValueChange={(value) => {
          if (value !== status) setNext(value as LibraryMemberStatus);
        }}
        className="w-44"
        aria-label={t("columns.status")}
      />
      <ConfirmDialog
        open={next !== null}
        onOpenChange={(open) => {
          if (!open) setNext(null);
        }}
        title={tDetail("confirmStatus.title")}
        description={
          next
            ? tDetail("confirmStatus.body", { name: memberName, status: t(`status.${next}`) })
            : ""
        }
        confirmLabel={tDetail("confirmStatus.confirm")}
        tone={next === "suspended" || next === "inactive" ? "danger" : undefined}
        confirming={updateStatus.isPending}
        onConfirm={() => {
          if (!next) return;
          updateStatus.mutate(
            { userId, status: next },
            {
              onSuccess: () => {
                toast.success(t("statusUpdated"));
              },
              onError: (error) => {
                toast.error(
                  error instanceof ApiError
                    ? apiErrorMessage(error.code)
                    : apiErrorMessage("UNKNOWN"),
                );
              },
              onSettled: () => {
                setNext(null);
              },
            },
          );
        }}
      />
    </>
  );
}
