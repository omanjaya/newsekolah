"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  IconCircle,
  List,
  ListRow,
  SectionHeader,
  Skeleton,
  SkeletonList,
  useToast,
} from "@newsekolah/ui";
import { Laptop, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePushDevicesQuery, useWebPush } from "../../notifications/push-api";

import { SettingSwitchRow } from "./setting-switch-row";

/**
 * Turning on push in this browser, and the list of every device the
 * account pushes to. The two belong together: a viewer who wonders why a
 * notification reached their phone but not their desktop is looking for
 * exactly this list.
 *
 * The list is read-only. Unregistering takes the device's push token,
 * which the API deliberately never returns, so a device can only be
 * removed from the device itself by turning this switch off there.
 */
export function PushDevicesSection(): ReactElement {
  const t = useTranslations("app.settings.notifications.push");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { state, busy, enable, disable } = useWebPush();
  const devices = usePushDevicesQuery();

  async function onToggle(checked: boolean) {
    try {
      if (checked) {
        const granted = await enable();
        toast[granted ? "success" : "error"](granted ? t("enabled") : t("denied"));
        return;
      }
      await disable();
      toast.success(t("disabled"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const items = devices.data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-5 px-5 pb-5">
        {state === null ? (
          <Skeleton className="h-11 w-full rounded-md" />
        ) : state === "unsupported" ? (
          <p className="text-body-sm text-fg-muted">{t("unsupported")}</p>
        ) : state === "denied" ? (
          <p className="text-body-sm text-fg-muted">{t("blocked")}</p>
        ) : (
          <SettingSwitchRow
            label={t("toggleLabel")}
            checked={state === "enabled"}
            disabled={busy}
            onCheckedChange={(checked) => {
              void onToggle(checked);
            }}
          />
        )}

        <section className="flex flex-col gap-2">
          <SectionHeader as="h3" title={t("devicesTitle")} description={t("removeHint")} />
          {devices.isLoading ? (
            <SkeletonList rows={2} framed={false} />
          ) : devices.isError && !devices.data ? (
            <QueryError retry={() => devices.refetch()} error={devices.error} />
          ) : items.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("noDevices")}</p>
          ) : (
            <List framed dense>
              {items.map((device) => (
                <ListRow
                  key={device.id}
                  leading={
                    <IconCircle tone="neutral" size="sm">
                      {device.platform === "web" ? <Laptop /> : <Smartphone />}
                    </IconCircle>
                  }
                  title={device.device_name}
                />
              ))}
            </List>
          )}
        </section>
      </div>
    </Card>
  );
}
