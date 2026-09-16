"use client";

import { ApiError } from "@newsekolah/api-client";
import { Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryMemberStatus, useUpdateLibraryMemberStatusMutation } from "../members-api";

const CHANGEABLE_STATUSES: LibraryMemberStatus[] = ["pending", "active", "inactive", "suspended"];

/** Status changes exclude "cleared", which only the clearance action can set. */
export function MemberStatusMenu({
  userId,
  status,
}: {
  userId: string;
  status: LibraryMemberStatus;
}): ReactElement {
  const t = useTranslations("app.library.members");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const updateStatus = useUpdateLibraryMemberStatusMutation();

  return (
    <Select
      options={CHANGEABLE_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
      value={CHANGEABLE_STATUSES.includes(status) ? status : undefined}
      placeholder={t(`status.${status}`)}
      disabled={updateStatus.isPending}
      onValueChange={(next) => {
        updateStatus.mutate(
          { userId, status: next as LibraryMemberStatus },
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
          },
        );
      }}
      className="w-40"
      aria-label={t("columns.status")}
    />
  );
}
