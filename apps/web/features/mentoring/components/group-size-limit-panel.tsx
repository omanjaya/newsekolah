"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DialogFooter, Field, NumberInput, SkeletonForm, useToast } from "@newsekolah/ui";
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
 * It sits in a dialog: `onDone` closes it after a save, or on cancel.
 */
export function GroupSizeLimitPanel({ onDone }: { onDone?: () => void }): ReactElement {
  const t = useTranslations("app.mentoring.groupSizeLimit");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentor_groups");

  const { data, isLoading } = useGroupSizeLimitQuery();
  const setLimit = useSetGroupSizeLimitMutation();
  // `undefined` means the field still shows the server's own value; once the
  // user types, this takes over and stays in charge for the rest of the edit.
  const [draft, setDraft] = useState<number | null | undefined>(undefined);

  if (isLoading) {
    return <SkeletonForm fields={1} />;
  }

  const value = draft === undefined ? (data?.limit ?? null) : draft;
  const parsed = value ?? Number.NaN;
  const dirty = data !== undefined && value !== null && parsed !== data.limit;
  const invalid = value !== null && parsed < 1;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        setLimit.mutate(parsed, {
          onSuccess: () => {
            toast.success(t("saved"));
            onDone?.();
          },
          onError: (error) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <Field label={t("label")} hint={t("hint")}>
        <NumberInput min={1} value={value} disabled={!canManage} onChange={setDraft} />
      </Field>
      {canManage && (
        <DialogFooter>
          {onDone && (
            <Button type="button" variant="secondary" onClick={onDone}>
              {t("cancel")}
            </Button>
          )}
          <Button type="submit" loading={setLimit.isPending} disabled={!dirty || invalid}>
            {t("submit")}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}
