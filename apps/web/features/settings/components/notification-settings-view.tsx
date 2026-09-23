"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { Button, PageHeader, Select, Skeleton, Switch, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  type NotificationChannel,
  type NotificationKind,
  type NotificationSettingsInput,
  useNotificationSettingsQuery,
  usePreferencesQuery,
  useSetPreferenceMutation,
  useUpdateNotificationSettingsMutation,
} from "../../notifications/api";

import { PushDevicesSection } from "./push-devices-section";

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, "0")}.00`,
}));

/**
 * Per-kind channel matrix plus quiet hours and the daily digest, per
 * docs/07-ui-ux.md section 5 ("preferensi per kategori dan kanal;
 * ringkasan harian sebagai opsi agar tidak membanjiri guru").
 */
export function NotificationSettingsView(): ReactElement {
  const t = useTranslations("app.settings.notifications");
  const tKinds = useTranslations("app.notifications.kinds");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const prefs = usePreferencesQuery();
  const setPreference = useSetPreferenceMutation();
  const settings = useNotificationSettingsQuery();
  const updateSettings = useUpdateNotificationSettingsMutation();

  function toggle(kind: NotificationKind, channel: NotificationChannel, enabled: boolean) {
    setPreference.mutate(
      { kind, channel, enabled },
      {
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  async function saveSettings(input: NotificationSettingsInput) {
    try {
      await updateSettings.mutateAsync(input);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("channelsTitle")}</h2>
        <p className="text-[13px] text-fg-muted">{t("channelsBody")}</p>
        {prefs.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("kindColumn")}
                  </th>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <th key={channel} scope="col" className="px-2 py-2 text-center font-medium">
                      {t(`channels.${channel}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {NOTIFICATION_KINDS.map((kind) => {
                  const row = prefs.data?.[kind] ?? {};
                  return (
                    <tr key={kind}>
                      <th scope="row" className="py-2 pr-4 text-left font-normal text-fg">
                        {tKinds(kind)}
                      </th>
                      {NOTIFICATION_CHANNELS.map((channel) => (
                        <td key={channel} className="px-2 py-2 text-center">
                          <Switch
                            checked={row[channel] ?? false}
                            disabled={channel === "inapp"}
                            aria-label={`${tKinds(kind)}: ${t(`channels.${channel}`)}`}
                            onCheckedChange={(checked) => {
                              toggle(kind, channel, checked);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!prefs.isLoading && (
          // A four-column matrix on a phone shows one column and hides the
          // rest behind a sideways scroll nothing announces. Stacked per
          // kind, every channel for that kind is on screen at once.
          <ul className="flex flex-col gap-3 md:hidden">
            {NOTIFICATION_KINDS.map((kind) => {
              const row = prefs.data?.[kind] ?? {};
              return (
                <li key={kind} className="flex flex-col gap-2 rounded-sm border border-border p-3">
                  <span className="text-[13px] font-medium text-fg">{tKinds(kind)}</span>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <div key={channel} className="flex items-center justify-between gap-3">
                        <span className="text-[13px] text-fg-muted">
                          {t(`channels.${channel}`)}
                        </span>
                        <Switch
                          checked={row[channel] ?? false}
                          disabled={channel === "inapp"}
                          aria-label={`${tKinds(kind)}: ${t(`channels.${channel}`)}`}
                          onCheckedChange={(checked) => {
                            toggle(kind, channel, checked);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PushDevicesSection />

      <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("timingTitle")}</h2>
        {settings.isError && !settings.data ? (
          <QueryError retry={() => settings.refetch()} />
        ) : settings.isLoading || !settings.data ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <TimingForm
            key={settings.dataUpdatedAt}
            initial={settings.data}
            saving={updateSettings.isPending}
            onSave={saveSettings}
          />
        )}
      </section>
    </div>
  );
}

type Settings = components["schemas"]["NotificationSettings"];

/** Keyed on the query's update time so a refetch resets the local edits. */
function TimingForm({
  initial,
  saving,
  onSave,
}: {
  initial: Settings;
  saving: boolean;
  onSave: (input: NotificationSettingsInput) => Promise<void>;
}): ReactElement {
  const t = useTranslations("app.settings.notifications");
  const hasQuiet = initial.quiet_hours_start !== undefined && initial.quiet_hours_end !== undefined;
  const [digestEnabled, setDigestEnabled] = useState(initial.digest_enabled);
  const [digestHour, setDigestHour] = useState(String(initial.digest_hour));
  const [quietEnabled, setQuietEnabled] = useState(hasQuiet);
  const [quietStart, setQuietStart] = useState(String(initial.quiet_hours_start ?? 21));
  const [quietEnd, setQuietEnd] = useState(String(initial.quiet_hours_end ?? 6));

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col">
          <span className="text-[14px] text-fg">{t("quietHoursLabel")}</span>
          <span className="text-[13px] text-fg-muted">{t("quietHoursBody")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={quietEnabled}
            onCheckedChange={setQuietEnabled}
            aria-label={t("quietHoursLabel")}
          />
          <Select
            options={HOURS}
            value={quietStart}
            onValueChange={setQuietStart}
            disabled={!quietEnabled}
            aria-label={t("quietFrom")}
            className="w-28"
          />
          <span className="text-[13px] text-fg-muted">{t("quietTo")}</span>
          <Select
            options={HOURS}
            value={quietEnd}
            onValueChange={setQuietEnd}
            disabled={!quietEnabled}
            aria-label={t("quietTo")}
            className="w-28"
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col">
          <span className="text-[14px] text-fg">{t("digestLabel")}</span>
          <span className="text-[13px] text-fg-muted">{t("digestBody")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={digestEnabled}
            onCheckedChange={setDigestEnabled}
            aria-label={t("digestLabel")}
          />
          <Select
            options={HOURS}
            value={digestHour}
            onValueChange={setDigestHour}
            disabled={!digestEnabled}
            aria-label={t("digestHour")}
            className="w-28"
          />
        </div>
      </div>
      <div>
        <Button
          size="sm"
          loading={saving}
          onClick={() =>
            void onSave({
              digest_enabled: digestEnabled,
              digest_hour: Number(digestHour),
              ...(quietEnabled
                ? { quiet_hours_start: Number(quietStart), quiet_hours_end: Number(quietEnd) }
                : {}),
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </>
  );
}
