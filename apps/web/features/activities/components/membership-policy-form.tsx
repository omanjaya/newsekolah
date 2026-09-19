"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, useToast } from "@newsekolah/ui";
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
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {policy.isError && <p role="alert">{t("loadError")}</p>}
      <label className="flex flex-col gap-1 text-sm">
        {t("limit")}
        <Input
          type="number"
          min={0}
          step={1}
          required
          value={limit ?? policy.data?.max_clubs_per_student ?? ""}
          onChange={(event) => {
            setLimit(event.target.value);
          }}
          disabled={!policy.data}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!policy.data} loading={update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
