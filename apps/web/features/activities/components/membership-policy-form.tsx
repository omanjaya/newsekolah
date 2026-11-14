"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, DialogFooter, Field, NumberInput, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useMembershipPolicyQuery, useUpdateMembershipPolicyMutation } from "../api";

export function MembershipPolicyForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.activities.clubs.policy");
  const policy = useMembershipPolicyQuery();
  const update = useUpdateMembershipPolicyMutation();
  const [limit, setLimit] = useState<string | null>(null);
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!policy.data) return;
        update.mutate(Number(limit ?? policy.data.max_clubs_per_student), {
          onSuccess: () => {
            toast.success(t("saved"));
            onDone();
          },
          onError: (error) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <p className="text-body-sm text-fg-muted">{t("description")}</p>
      {policy.isError && <Alert variant="danger" title={t("loadError")} />}
      <Field label={t("limit")} required>
        <NumberInput
          min={0}
          required
          value={
            limit !== null
              ? limit === ""
                ? null
                : Number(limit)
              : (policy.data?.max_clubs_per_student ?? null)
          }
          disabled={!policy.data}
          onChange={(next) => {
            setLimit(next === null ? "" : String(next));
          }}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!policy.data} loading={update.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
