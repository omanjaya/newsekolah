"use client";

import { ApiError, queryKeys } from "@newsekolah/api-client";
import { Card, CardDescription, CardHeader, CardTitle, useToast } from "@newsekolah/ui";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiClient } from "../../../lib/api/client";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useNotificationKinds,
  type NotificationChannel,
  type NotificationKind,
  useSetTenantNotificationDefaultMutation,
} from "../../notifications/api";

import { NotificationChannelMatrix } from "./notification-channel-matrix";
import { SettingsPage } from "./settings-page";

/**
 * Tenant-wide default channels per notification kind, as opposed to
 * `NotificationSettingsView` which edits the signed-in user's own
 * preferences. A user who never touched their own preference falls back to
 * this default (see GET /v1/notification-preferences on the API side).
 * A switch saves at once; only a failure says anything.
 */
export function NotificationDefaultsView(): ReactElement {
  const t = useTranslations("app.settings.notificationDefaults");
  const tKinds = useTranslations("app.notifications.kinds");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const client = useApiClient();
  const kinds = useNotificationKinds();
  const setDefault = useSetTenantNotificationDefaultMutation();
  // One read per kind (the API answers per kind), sharing the cache entries
  // of useTenantNotificationDefaultQuery.
  const defaults = useQueries({
    queries: kinds.map((kind) => ({
      queryKey: queryKeys.tenantNotificationDefault(kind),
      queryFn: () =>
        client.GET("/v1/tenant/notification-defaults", { params: { query: { kind } } }),
    })),
  });

  function toggle(kind: NotificationKind, channel: NotificationChannel, enabled: boolean) {
    setDefault.mutate(
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
    <SettingsPage navKey="settings-notification-defaults" description={t("body")}>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("channelsTitle")}</CardTitle>
          <CardDescription>{t("channelsBody")}</CardDescription>
        </CardHeader>
        <NotificationChannelMatrix
          kindLabel={t("kindColumn")}
          channelLabel={(channel) => t(`channels.${channel}`)}
          failedLabel={t("loadFailed")}
          onToggle={toggle}
          rows={kinds.map((kind, index) => {
            const query = defaults[index];
            return {
              kind,
              label: tKinds(kind),
              values: query?.data,
              loading: query?.isLoading ?? true,
              failed: query ? query.isError && !query.data : false,
              onRetry: () => void query?.refetch(),
            };
          })}
        />
      </Card>
    </SettingsPage>
  );
}
