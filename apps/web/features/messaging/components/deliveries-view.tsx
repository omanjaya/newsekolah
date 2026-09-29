"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Badge, Button, Select, Skeleton, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  useResendWhatsAppDeliveryMutation,
  useWhatsAppDeliveriesQuery,
  type WhatsAppDeliveryStatus,
} from "../api";

const STATUS_CLASS: Record<WhatsAppDeliveryStatus, string> = {
  pending: "text-fg-muted",
  sent: "text-status-present",
  delivered: "text-status-present",
  read: "text-status-present",
  failed: "text-status-absent",
};

export function DeliveriesView(): ReactElement {
  const t = useTranslations("app.messaging.deliveries");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const [status, setStatus] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";

  const query = useWhatsAppDeliveriesQuery(status, cursor);
  const resend = useResendWhatsAppDeliveryMutation();

  async function handleResend(deliveryId: string) {
    try {
      await resend.mutateAsync(deliveryId);
      toast.success(t("resent"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const deliveries = query.data?.data ?? [];
  const nextCursor = query.data?.page.next_cursor ?? "";

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
          <p className="text-[13px] text-fg-muted">{t("body")}</p>
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value === "all" ? "" : value);
            setCursors([""]);
          }}
          options={[
            { value: "all", label: t("filterAll") },
            { value: "pending", label: t("status.pending") },
            { value: "sent", label: t("status.sent") },
            { value: "delivered", label: t("status.delivered") },
            { value: "read", label: t("status.read") },
            { value: "failed", label: t("status.failed") },
          ]}
        />
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : deliveries.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left">
                <th scope="col" className="px-4 py-3 text-[12px] font-semibold text-fg-muted">
                  {t("columns.target")}
                </th>
                <th scope="col" className="px-4 py-3 text-[12px] font-semibold text-fg-muted">
                  {t("columns.provider")}
                </th>
                <th scope="col" className="px-4 py-3 text-[12px] font-semibold text-fg-muted">
                  {t("columns.status")}
                </th>
                <th scope="col" className="px-4 py-3 text-[12px] font-semibold text-fg-muted">
                  {t("columns.attempts")}
                </th>
                <th scope="col" className="px-4 py-3 text-[12px] font-semibold text-fg-muted">
                  {t("columns.createdAt")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-[12px] font-semibold text-fg-muted"
                >
                  {t("columns.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b border-line last:border-b-0 hover:bg-bg">
                  <td className="px-4 py-3 text-fg">{delivery.target}</td>
                  <td className="px-4 py-3 text-fg-muted">{delivery.provider}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <Badge className={STATUS_CLASS[delivery.status]}>
                        {t(`status.${delivery.status}`)}
                      </Badge>
                      {delivery.status === "failed" && delivery.error && (
                        <span className="text-fg-muted" title={delivery.error}>
                          {t("errorLabel")}: {delivery.error}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{delivery.attempts}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {formatDateTime(delivery.created_at, { locale, timeZone })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {delivery.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleResend(delivery.id)}
                      >
                        {t("resend")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setCursors((c) => [...c, nextCursor]);
            }}
          >
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
