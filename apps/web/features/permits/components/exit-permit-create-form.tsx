"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Checkbox,
  DialogFooter,
  Field,
  FormError,
  FormSection,
  Input,
  Select,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePeriodsQuery } from "../../reference/api";
import { useCreateExitPermitMutation } from "../api";
import {
  endAfterStartChange,
  endPeriodOptions,
  lessonPeriodOptions,
  upcomingLessonPeriods,
} from "../lib/lesson-period-options";
import { ownExitRefusalKey } from "../lib/own-exit-refusal";
import { useSchoolTime } from "../lib/use-school-time";

/**
 * The student's own exit permit request: destination, the lessons it
 * covers (only those still running or to come), and whether they return.
 */
export function CreateForm({
  onDone,
  onCancel,
}: {
  onDone: (id: string) => void;
  onCancel?: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.exit.form");
  const locale = useLocale();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const periods = usePeriodsQuery();
  const create = useCreateExitPermitMutation();
  // Only the lessons still running or to come on the school's clock (the
  // simulated one under the time simulation): the API refuses a window
  // that is already over.
  const schoolTime = useSchoolTime();
  const options = lessonPeriodOptions(
    upcomingLessonPeriods(periods.data?.data ?? [], schoolTime),
    locale,
  );
  const dayOver = periods.isSuccess && options.length === 0;
  const [destination, setDestination] = useState("");
  const [startId, setStartId] = useState("");
  const [endId, setEndId] = useState("");
  const [returns, setReturns] = useState(true);
  const [error, setError] = useState<{ message: string; refused: boolean } | null>(null);
  const [attempted, setAttempted] = useState(false);

  async function submit() {
    setError(null);
    setAttempted(true);
    if (!destination.trim() || !startId || !endId) return;
    try {
      const detail = await create.mutateAsync({
        destination: destination.trim(),
        start_period_id: startId,
        end_period_id: endId,
        return_required: returns,
      });
      toast.success(t("created"));
      onDone(detail.instance.id);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      const own = ownExitRefusalKey(code);
      // A 409 refuses the request itself (titled so), not one of its fields.
      const refused = err instanceof ApiError && err.status === 409;
      setError({ message: own ? t(own) : apiErrorMessage(code), refused });
    }
  }

  const required = t("required");
  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <FormError title={error.refused ? t("refusedTitle") : undefined}>{error.message}</FormError>
      )}
      {dayOver && <p className="text-body-sm text-fg-muted">{t("noPeriodsLeft")}</p>}
      <FormSection>
        <Field
          label={t("destination")}
          error={attempted && !destination.trim() ? required : undefined}
          required
          className="col-span-full"
        >
          <Input
            value={destination}
            maxLength={500}
            onChange={(e) => {
              setDestination(e.target.value);
            }}
            placeholder={t("destinationPlaceholder")}
          />
        </Field>
        <Field label={t("from")} error={attempted && !startId ? required : undefined} required>
          <Select
            options={options}
            value={startId}
            onValueChange={(v) => {
              setStartId(v);
              setEndId(endAfterStartChange(options, v, endId));
            }}
            placeholder={t("pick")}
          />
        </Field>
        <Field label={t("to")} error={attempted && !endId ? required : undefined} required>
          <Select
            options={endPeriodOptions(options, startId)}
            value={endId}
            onValueChange={setEndId}
            placeholder={t("pick")}
          />
        </Field>
        <Checkbox
          containerClassName="col-span-full"
          checked={returns}
          onCheckedChange={(value) => {
            setReturns(value === true);
          }}
          label={t("returns")}
          description={t("returnsHint")}
        />
      </FormSection>
      <p className="text-body-sm text-fg-muted">{t("stagesHint")}</p>
      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button type="submit" loading={create.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
