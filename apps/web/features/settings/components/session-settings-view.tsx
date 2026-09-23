"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, PageHeader, Skeleton, Switch, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type AuthSettings, useAuthSettingsQuery, useUpdateAuthSettingsMutation } from "../api";

const MIN_DAYS = 1;
const MAX_DAYS = 365;

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
  const { data, isLoading, isError, refetch } = useAuthSettingsQuery();

  if (isError && !data) return <QueryError retry={() => refetch()} className="m-4" />;

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Skeleton className="h-40 w-full" />
      </div>
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
  const [days, setDays] = useState(initial.session_days);
  const [singleDevice, setSingleDevice] = useState(initial.single_device);
  const [error, setError] = useState<string | null>(null);

  const dirty = days !== saved.session_days || singleDevice !== saved.single_device;
  const turningOn = singleDevice && !saved.single_device;

  function save() {
    setError(null);
    if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
      setError(t("daysRangeError", { min: MIN_DAYS, max: MAX_DAYS }));
      return;
    }
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
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("intro")}</p>

      <section className="flex flex-col gap-6 rounded-sm border border-border bg-surface p-4 md:max-w-2xl">
        {error && (
          <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("daysLabel")}</span>
          <Input
            type="number"
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
            }}
            className="w-32"
          />
          <span className="text-fg-muted">{t("daysHint")}</span>
        </label>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="text-[14px] font-medium text-fg">{t("singleDeviceLabel")}</span>
              <span className="text-[13px] text-fg-muted">{t("singleDeviceHint")}</span>
            </span>
            <Switch
              checked={singleDevice}
              aria-label={t("singleDeviceLabel")}
              onCheckedChange={setSingleDevice}
            />
          </div>
          {turningOn && <p className="text-[13px] text-fg-muted">{t("singleDeviceExplain")}</p>}
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button disabled={!dirty} loading={update.isPending} onClick={save}>
            {t("save")}
          </Button>
        </div>
      </section>
    </div>
  );
}
