"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FormSection,
  Select,
  SkeletonForm,
  SkeletonList,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useNotificationKinds,
  type NotificationChannel,
  type NotificationKind,
  type NotificationSettingsInput,
  useNotificationSettingsQuery,
  usePreferencesQuery,
  useSetPreferenceMutation,
  useUpdateNotificationSettingsMutation,
} from "../../notifications/api";

import { NotificationChannelMatrix } from "./notification-channel-matrix";
import { PushDevicesSection } from "./push-devices-section";
import { SettingSwitchRow } from "./setting-switch-row";
import { SettingsPage } from "./settings-page";
import { SettingsSaveBar } from "./settings-save-bar";

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, "0")}.00`,
}));

type Settings = components["schemas"]["NotificationSettings"];

interface TimingValues {
  digestEnabled: boolean;
  digestHour: string;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

function timingOf(settings: Settings): TimingValues {
  return {
    digestEnabled: settings.digest_enabled,
    digestHour: String(settings.digest_hour),
    quietEnabled:
      settings.quiet_hours_start !== undefined && settings.quiet_hours_end !== undefined,
    quietStart: String(settings.quiet_hours_start ?? 21),
    quietEnd: String(settings.quiet_hours_end ?? 6),
  };
}

/**
 * The reader's own notification preferences, per docs/07-ui-ux.md section
 * 5 ("preferensi per kategori dan kanal; ringkasan harian sebagai opsi agar
 * tidak membanjiri guru"): when the reader is notified (quiet hours and
 * the daily digest, saved from the bar), each kind against its channels
 * (saved per switch), and the browser's push devices.
 */
export function NotificationSettingsView(): ReactElement {
  const t = useTranslations("app.settings.notifications");
  const tKinds = useTranslations("app.notifications.kinds");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const kinds = useNotificationKinds();
  const prefs = usePreferencesQuery();
  const setPreference = useSetPreferenceMutation();
  const settings = useNotificationSettingsQuery();
  const updateSettings = useUpdateNotificationSettingsMutation();

  // A failed read must not render every switch as off, as if that were the saved state.
  const prefsFailed = prefs.isError && !prefs.data;

  // The timing draft belongs to one read of the settings: a refetch (after
  // a save) starts again from what the server holds.
  const [draft, setDraft] = useState<{ at: number; values: TimingValues } | null>(null);
  const saved = settings.data ? timingOf(settings.data) : undefined;
  const timing = draft?.at === settings.dataUpdatedAt ? draft.values : saved;
  const timingDirty =
    timing !== undefined && saved !== undefined && JSON.stringify(timing) !== JSON.stringify(saved);

  function patchTiming(next: Partial<TimingValues>) {
    if (!timing) return;
    setDraft({ at: settings.dataUpdatedAt, values: { ...timing, ...next } });
  }

  async function saveTiming() {
    if (!timing) return;
    const input: NotificationSettingsInput = {
      digest_enabled: timing.digestEnabled,
      digest_hour: Number(timing.digestHour),
      ...(timing.quietEnabled
        ? {
            quiet_hours_start: Number(timing.quietStart),
            quiet_hours_end: Number(timing.quietEnd),
          }
        : {}),
    };
    try {
      await updateSettings.mutateAsync(input);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

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

  return (
    <SettingsPage
      navKey="settings-notifications"
      description={t("description")}
      floating={
        <SettingsSaveBar
          dirty={timingDirty}
          saving={updateSettings.isPending}
          onSave={() => void saveTiming()}
          onDiscard={() => {
            setDraft(null);
          }}
        />
      }
    >
      {settings.isError && !settings.data ? (
        <QueryError retry={() => settings.refetch()} error={settings.error} />
      ) : !timing ? (
        <SkeletonForm fields={2} actions={false} />
      ) : (
        <FormSection variant="card" columns={1} title={t("timingTitle")}>
          <SettingSwitchRow
            label={t("quietHoursLabel")}
            hint={t("quietHoursBody")}
            checked={timing.quietEnabled}
            onCheckedChange={(quietEnabled) => {
              patchTiming({ quietEnabled });
            }}
          />
          {timing.quietEnabled && (
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <Field label={t("quietFrom")}>
                <Select
                  options={HOURS}
                  value={timing.quietStart}
                  onValueChange={(quietStart) => {
                    patchTiming({ quietStart });
                  }}
                />
              </Field>
              <Field label={t("quietUntil")}>
                <Select
                  options={HOURS}
                  value={timing.quietEnd}
                  onValueChange={(quietEnd) => {
                    patchTiming({ quietEnd });
                  }}
                />
              </Field>
            </div>
          )}
          <SettingSwitchRow
            label={t("digestLabel")}
            hint={t("digestBody")}
            checked={timing.digestEnabled}
            onCheckedChange={(digestEnabled) => {
              patchTiming({ digestEnabled });
            }}
          />
          {timing.digestEnabled && (
            <Field label={t("digestHour")} className="sm:max-w-44">
              <Select
                options={HOURS}
                value={timing.digestHour}
                onValueChange={(digestHour) => {
                  patchTiming({ digestHour });
                }}
              />
            </Field>
          )}
        </FormSection>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("channelsTitle")}</CardTitle>
          <CardDescription>{t("channelsBody")}</CardDescription>
        </CardHeader>
        {prefsFailed ? (
          <div className="px-5 pb-5">
            <QueryError retry={() => prefs.refetch()} error={prefs.error} />
          </div>
        ) : prefs.isLoading ? (
          <SkeletonList rows={4} leading={false} framed={false} className="px-5 pb-5" />
        ) : (
          <NotificationChannelMatrix
            kindLabel={t("kindColumn")}
            channelLabel={(channel) => t(`channels.${channel}`)}
            failedLabel={t("loadFailed")}
            onToggle={toggle}
            rows={kinds.map((kind) => ({
              kind,
              label: tKinds(kind),
              values: prefs.data?.[kind],
            }))}
          />
        )}
      </Card>

      <PushDevicesSection />
    </SettingsPage>
  );
}
