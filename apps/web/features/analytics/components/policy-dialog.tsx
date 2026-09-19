"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, Dialog, DialogContent, Input, Skeleton, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type EarlyWarningPolicy,
  useEarlyWarningPolicyQuery,
  useUpdateEarlyWarningPolicyMutation,
} from "../api";

type Field = Exclude<keyof EarlyWarningPolicy, "version">;
const fields: Field[] = [
  "window_days",
  "attendance_watch_rate",
  "attendance_at_risk_rate",
  "discipline_watch_points",
  "discipline_at_risk_points",
  "warning_letter_watch_count",
  "warning_letter_at_risk_count",
  "grade_drop_watch_points",
  "grade_drop_at_risk_points",
  "attendance_weight",
  "discipline_weight",
  "warning_weight",
  "grade_weight",
  "watch_score",
  "at_risk_score",
];

export function PolicyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <PolicyContent
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}

function PolicyContent({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.analytics.policy");
  const policy = useEarlyWarningPolicyQuery();
  const apiErrorMessage = useApiErrorMessage();
  return (
    <DialogContent title={t("title")}>
      {policy.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : policy.error ? (
        <Alert
          variant="warning"
          title={
            policy.error instanceof ApiError
              ? apiErrorMessage(policy.error.code)
              : apiErrorMessage("UNKNOWN")
          }
        />
      ) : policy.data ? (
        <PolicyForm key={policy.data.version} initial={policy.data} onDone={onDone} />
      ) : null}
    </DialogContent>
  );
}

function PolicyForm({
  initial,
  onDone,
}: {
  initial: EarlyWarningPolicy;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.analytics.policy");
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();
  const update = useUpdateEarlyWarningPolicyMutation();
  const [draft, setDraft] = useState(
    () =>
      Object.fromEntries(fields.map((key) => [key, String(initial[key])])) as Record<Field, string>,
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const body = { ...initial };
        for (const key of fields) body[key] = Number(draft[key]);
        if (
          body.attendance_at_risk_rate <= body.attendance_watch_rate ||
          body.discipline_at_risk_points <= body.discipline_watch_points ||
          body.warning_letter_at_risk_count <= body.warning_letter_watch_count ||
          body.grade_drop_at_risk_points <= body.grade_drop_watch_points ||
          body.at_risk_score <= body.watch_score
        ) {
          setError(t("thresholdError"));
          return;
        }
        update.mutate(body, {
          onSuccess: () => {
            toast.success(t("saved"));
            onDone();
          },
          onError: (err) => {
            setError(
              err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <p className="text-sm text-fg-muted">{t("description")}</p>
      {error && <Alert variant="warning" title={error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((key) => {
          const rate = key.endsWith("_rate");
          const decimal = rate || key.startsWith("grade_drop_");
          return (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span>{t(`fields.${key}`)}</span>
              <Input
                type="number"
                required
                min={decimal ? 0.01 : 1}
                max={rate ? 1 : undefined}
                step={decimal ? 0.01 : 1}
                value={draft[key]}
                onChange={(event) => {
                  setDraft({ ...draft, [key]: event.target.value });
                }}
              />
            </label>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
