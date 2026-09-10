"use client";

import { ApiError } from "@newsekolah/api-client";
import { Skeleton, Switch, useToast } from "@newsekolah/ui";
import { Laptop, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePushDevicesQuery, useWebPush } from "../../notifications/push-api";

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
    <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div>
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("body")}</p>
      </div>

      {state === null ? (
        <Skeleton className="h-10 w-full" />
      ) : state === "unsupported" ? (
        <p className="text-[13px] text-fg-muted">{t("unsupported")}</p>
      ) : state === "denied" ? (
        <p className="text-[13px] text-fg-muted">{t("blocked")}</p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="web-push-toggle" className="text-[13px] text-fg">
            {t("toggleLabel")}
          </label>
          <Switch
            id="web-push-toggle"
            checked={state === "enabled"}
            disabled={busy}
            onCheckedChange={(checked) => {
              void onToggle(checked);
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium text-fg">{t("devicesTitle")}</h3>
        {devices.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : items.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("noDevices")}</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {items.map((device) => (
                <li key={device.id} className="flex items-center gap-3 py-2">
                  {device.platform === "web" ? (
                    <Laptop className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  ) : (
                    <Smartphone className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  )}
                  <span className="text-[13px] text-fg">{device.device_name}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-fg-muted">{t("removeHint")}</p>
          </>
        )}
      </div>
    </section>
  );
}
