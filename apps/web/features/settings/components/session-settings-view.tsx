"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Field,
  FormError,
  FormSection,
  NumberInput,
  SkeletonForm,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type AuthSettings, useAuthSettingsQuery, useUpdateAuthSettingsMutation } from "../api";

import { SettingSwitchRow } from "./setting-switch-row";
import { SettingsPage } from "./settings-page";
import { SettingsSaveBar } from "./settings-save-bar";

const MIN_DAYS = 1;
const MAX_DAYS = 365;
const NAV_KEY = "settings-session";

/**
 * Tenant-wide session policy (GET/PUT /v1/auth/settings): how many days a
 * session stays valid, and whether logging in on a new device signs out
 * every other device the user was already using. Enabling single-device
 * login does not retroactively touch sessions that are open right now: the
 * API only revokes a user's other sessions the next time that user logs in
 * (identity/service/auth.go), so the explanation shown while the switch is
 * on says that plainly instead of implying an immediate sign-out, and it
 * stays visible for as long as the change is unsaved.
 */
export function SessionSettingsView(): ReactElement {
  const t = useTranslations("app.settings.session");
  const { data, isLoading, isError, error, refetch } = useAuthSettingsQuery();

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
        <SkeletonForm fields={2} actions={false} />
      </SettingsPage>
    );
  }

  return <SessionSettingsForm initial={data} />;
}

function SessionSettingsForm({ initial }: { initial: AuthSettings }): ReactElement {
  const t = useTranslations("app.settings.session");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateAuthSettingsMutation();

  // `saved` is the last value confirmed by the server; it only moves
  // forward on a successful save, so `dirty` reflects unsaved edits
  // without depending on a refetch re-rendering this component.
  const [saved, setSaved] = useState(initial);
  const [days, setDays] = useState<number | null>(initial.session_days);
  const [singleDevice, setSingleDevice] = useState(initial.single_device);
  const [error, setError] = useState<string | null>(null);

  const dirty = days !== saved.session_days || singleDevice !== saved.single_device;
  const turningOn = singleDevice && !saved.single_device;
  const daysValid = days !== null && Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS;
  const daysError = daysValid ? undefined : t("daysRangeError", { min: MIN_DAYS, max: MAX_DAYS });

  function save() {
    setError(null);
    if (!daysValid) return;
    update.mutate(
      { session_days: days, single_device: singleDevice },
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
            setDays(saved.session_days);
            setSingleDevice(saved.single_device);
            setError(null);
          }}
        />
      }
    >
      {error && <FormError>{error}</FormError>}
      <FormSection variant="card" columns={1} title={t("rulesTitle")}>
        <Field label={t("daysLabel")} hint={t("daysHint")} error={daysError}>
          <NumberInput
            min={MIN_DAYS}
            max={MAX_DAYS}
            suffix={t("daysUnit")}
            value={days}
            onChange={setDays}
            className="sm:w-48"
          />
        </Field>
        <SettingSwitchRow
          label={t("singleDeviceLabel")}
          hint={t("singleDeviceHint")}
          checked={singleDevice}
          onCheckedChange={setSingleDevice}
        />
        {turningOn && <Alert tone="info">{t("singleDeviceExplain")}</Alert>}
      </FormSection>
    </SettingsPage>
  );
}
