"use client";

import { ApiError } from "@newsekolah/api-client";
import { PageHeader, Skeleton, Switch, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  type NotificationChannel,
  type NotificationKind,
  useSetTenantNotificationDefaultMutation,
  useTenantNotificationDefaultQuery,
} from "../../notifications/api";

/**
 * Tenant-wide default channels per notification kind, as opposed to
 * `NotificationSettingsView` which edits the signed-in user's own
 * preferences. A user who never touched their own preference falls back to
 * this default (see GET /v1/notification-preferences on the API side).
 */
export function NotificationDefaultsView(): ReactElement {
  const t = useTranslations("app.settings.notificationDefaults");
  const tKinds = useTranslations("app.notifications.kinds");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("body")}</p>

      <div className="overflow-x-auto rounded-sm border border-border bg-surface">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="text-left text-fg-muted">
              <th scope="col" className="py-2 pl-3 pr-4 font-medium">
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
            {NOTIFICATION_KINDS.map((kind) => (
              <NotificationDefaultRow key={kind} kind={kind} label={tKinds(kind)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotificationDefaultRow({
  kind,
  label,
}: {
  kind: NotificationKind;
  label: string;
}): ReactElement {
  const t = useTranslations("app.settings.notificationDefaults");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading } = useTenantNotificationDefaultQuery(kind);
  const setDefault = useSetTenantNotificationDefaultMutation();

  function toggle(channel: NotificationChannel, enabled: boolean) {
    setDefault.mutate(
      { kind, channel, enabled },
      {
        onSuccess: () => {
          toast.success(t("saved"));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <tr>
      <th scope="row" className="py-2 pl-3 pr-4 text-left font-normal text-fg">
        {label}
      </th>
      {NOTIFICATION_CHANNELS.map((channel) => (
        <td key={channel} className="px-2 py-2 text-center">
          {isLoading ? (
            <Skeleton className="mx-auto h-5 w-9" />
          ) : (
            <Switch
              checked={data?.[channel] ?? false}
              disabled={channel === "inapp"}
              aria-label={`${label}: ${t(`channels.${channel}`)}`}
              onCheckedChange={(checked) => {
                toggle(channel, checked);
              }}
            />
          )}
        </td>
      ))}
    </tr>
  );
}
