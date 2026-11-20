"use client";

import { ApiError } from "@newsekolah/api-client";
import { Field, FormError, FormSection, NumberInput, SkeletonForm, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AttendanceSettings,
  useAttendanceSettingsQuery,
  useUpdateAttendanceSettingsMutation,
} from "../api";

import { SettingsPage } from "./settings-page";
import { SettingsSaveBar } from "./settings-save-bar";

/** The range the API accepts for attendance.correction_days. */
export const MIN_CORRECTION_DAYS = 1;
export const MAX_CORRECTION_DAYS = 90;
const NAV_KEY = "settings-attendance";

/**
 * The school's attendance policy (GET/PUT /v1/attendance/settings): how
 * many days after a lesson its teacher, the class's homeroom teacher and a
 * corrector may still change its attendance. Past that window nobody can,
 * the admin included, so this is the one place a school reopens older
 * attendance: a longer window applies to every session at once.
 */
export function AttendanceSettingsView(): ReactElement {
  const t = useTranslations("app.settings.attendance");
  const { data, isLoading, isError, error, refetch } = useAttendanceSettingsQuery();

  if (isError && !data) {
    return (
      <SettingsPage navKey={NAV_KEY} description={t("intro")}>
        <QueryError retry={() => refetch()} error={error} />
      </SettingsPage>
    );
  }

  if (isLoading || !data) {
    return (
      <SettingsPage navKey={NAV_KEY} description={t("intro")}>
        <SkeletonForm fields={1} actions={false} />
      </SettingsPage>
    );
  }

  return <AttendanceSettingsForm initial={data} />;
}

function AttendanceSettingsForm({ initial }: { initial: AttendanceSettings }): ReactElement {
  const t = useTranslations("app.settings.attendance");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateAttendanceSettingsMutation();

  // `saved` only moves forward on a successful save, so `dirty` reflects
  // unsaved edits without depending on a refetch.
  const [saved, setSaved] = useState(initial);
  const [days, setDays] = useState<number | null>(initial.correction_days);
  const [error, setError] = useState<string | null>(null);

  const dirty = days !== saved.correction_days;
  const daysValid =
    days !== null &&
    Number.isInteger(days) &&
    days >= MIN_CORRECTION_DAYS &&
    days <= MAX_CORRECTION_DAYS;
  const daysError = daysValid
    ? undefined
    : t("correctionDaysRangeError", { min: MIN_CORRECTION_DAYS, max: MAX_CORRECTION_DAYS });

  function save() {
    setError(null);
    if (!daysValid) return;
    update.mutate(
      { correction_days: days },
      {
        onSuccess: (result) => {
          setSaved(result);
          toast.success(t("saved"));
        },
        onError: (err) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <SettingsPage
      navKey={NAV_KEY}
      description={t("intro")}
      floating={
        <SettingsSaveBar
          dirty={dirty}
          saving={update.isPending}
          onSave={save}
          onDiscard={() => {
            setDays(saved.correction_days);
            setError(null);
          }}
        />
      }
    >
      {error && <FormError>{error}</FormError>}
      <FormSection variant="card" columns={1} title={t("correctionTitle")}>
        <Field
          label={t("correctionDaysLabel")}
          hint={t("correctionDaysHint", { min: MIN_CORRECTION_DAYS, max: MAX_CORRECTION_DAYS })}
          error={daysError}
        >
          <NumberInput
            min={MIN_CORRECTION_DAYS}
            max={MAX_CORRECTION_DAYS}
            suffix={t("daysUnit")}
            value={days}
            onChange={setDays}
            className="sm:w-48"
          />
        </Field>
      </FormSection>
    </SettingsPage>
  );
}
