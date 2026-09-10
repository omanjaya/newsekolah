"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Skeleton, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useGroupSizeLimitQuery, useSetGroupSizeLimitMutation } from "../api";

/**
 * The tenant-wide cap on how many students one mentor group may hold.
 * Reading it only needs `view_mentoring`; changing it needs
 * `manage_mentor_groups`, so the input stays read-only without that grant.
 */
export function GroupSizeLimitPanel(): ReactElement {
  const t = useTranslations("app.mentoring.groupSizeLimit");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentor_groups");

  const { data, isLoading } = useGroupSizeLimitQuery();
  const setLimit = useSetGroupSizeLimitMutation();
  // `undefined` means the field still shows the server's own value; once the
  // user types, this takes over and stays in charge for the rest of the edit.
  const [draft, setDraft] = useState<string | undefined>(undefined);

  if (isLoading) {
    return <Skeleton className="h-24 w-full max-w-sm" aria-busy="true" />;
  }

  const value = draft ?? (data ? String(data.limit) : "");
  const parsed = Number.parseInt(value, 10);
  const dirty = data !== undefined && parsed !== data.limit;
  const invalid = value !== "" && (!Number.isFinite(parsed) || parsed < 1);

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        setLimit.mutate(parsed, {
          onSuccess: () => {
            toast.success(t("saved"));
          },
          onError: (error) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("label")}</span>
        <Input
          type="number"
          min={1}
          value={value}
          disabled={!canManage}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
        <span className="text-[12px] text-fg-muted">{t("hint")}</span>
      </label>
      {canManage && (
        <div>
          <Button type="submit" size="sm" loading={setLimit.isPending} disabled={!dirty || invalid}>
            {t("submit")}
          </Button>
        </div>
      )}
    </form>
  );
}
