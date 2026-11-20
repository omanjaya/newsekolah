"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DialogFooter,
  Field,
  NumberInput,
  Alert,
  Button,
  Dialog,
  DialogContent,
  SectionHeader,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { isModuleEnabled } from "../../../lib/modules/feature-modules";
import { useSession } from "../../../lib/session/session-provider";
import {
  type EarlyWarningPolicy,
  useEarlyWarningPolicyQuery,
  useUpdateEarlyWarningPolicyMutation,
} from "../api";

import {
  POLICY_FIELDS as fields,
  type PolicyField,
  type PolicyGroup,
  visiblePolicyGroups,
} from "./policy-fields";

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
  const { me } = useSession();
  const groups = visiblePolicyGroups((module) => isModuleEnabled(me, module));
  const [draft, setDraft] = useState(
    () =>
      Object.fromEntries(fields.map((key) => [key, String(initial[key])])) as Record<
        PolicyField,
        string
      >,
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
          body.below_kktp_at_risk_count <= body.below_kktp_watch_count ||
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
      <p className="text-body-sm text-fg-muted">{t("description")}</p>
      {error && <Alert variant="danger" title={error} />}
      {/* More room between the sections than between the fields inside
          one, so each heading reads as the start of a new group. */}
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <PolicyFieldGroup key={group.id} group={group} draft={draft} onChange={setDraft} />
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={update.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * One section of the policy form. The school-day window stands alone on a
 * full row; every other section is a group named by its heading, so its
 * watch and at-risk fields read as a pair on one row. The heading is a
 * SectionHeader (the heading role, under the dialog's own title), a step
 * above the field labels it groups, not one more of them.
 */
function PolicyFieldGroup({
  group,
  draft,
  onChange,
}: {
  group: PolicyGroup;
  draft: Record<PolicyField, string>;
  onChange: (next: Record<PolicyField, string>) => void;
}): ReactElement {
  const t = useTranslations("app.analytics.policy");
  const titleId = useId();
  const inputs = group.fields.map((key) => {
    const rate = key.endsWith("_rate");
    const decimal = rate || key.startsWith("grade_drop_");
    return (
      <Field key={key} label={t(`fields.${key}`)} required>
        <NumberInput
          required
          min={decimal ? 0.01 : 1}
          max={rate ? 1 : undefined}
          step={decimal ? 0.01 : 1}
          precision={decimal ? 2 : 0}
          value={draft[key] === "" ? null : Number(draft[key])}
          onChange={(next) => {
            onChange({ ...draft, [key]: next === null ? "" : String(next) });
          }}
        />
      </Field>
    );
  });
  if (group.id === "window") return <>{inputs}</>;
  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-3">
      <SectionHeader as="h3" title={t(`groups.${group.id}`)} titleId={titleId} />
      <div className="grid grid-cols-2 gap-3">{inputs}</div>
    </div>
  );
}
