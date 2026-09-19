"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Button, DataTable, EmptyState, Select, useToast } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { History, RotateCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type WebhookDelivery,
  useRetryWebhookDeliveryMutation,
  useWebhookDeliveriesQuery,
  useWebhookEndpointsQuery,
} from "../api";

export function WebhookDeliveriesPanel({
  endpointId,
  onEndpointChange,
}: {
  endpointId: string;
  onEndpointChange: (endpointId: string) => void;
}): ReactElement {
  const t = useTranslations("app.integrations.deliveries");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const endpoints = useWebhookEndpointsQuery();
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";
  const { data, isLoading } = useWebhookDeliveriesQuery(endpointId, cursor);
  const retry = useRetryWebhookDeliveryMutation();

  function resetPaging() {
    setCursors([""]);
  }

  async function handleRetry(delivery: WebhookDelivery) {
    try {
      await retry.mutateAsync(delivery.id);
      toast.success(t("retryEnqueued"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const columns: ColumnDef<WebhookDelivery>[] = [
    {
      accessorKey: "created_at",
      header: t("columns.when"),
      cell: ({ row }) => formatDateTime(row.original.created_at, { locale, timeZone }),
    },
    { accessorKey: "event_type", header: t("columns.eventType") },
    {
      id: "status",
      header: t("columns.status"),
      cell: ({ row }) => {
        const delivery = row.original;
        if (delivery.status === "success") {
          return <span className="text-status-present">{t("statusSuccess")}</span>;
        }
        if (delivery.status === "failed") {
          return <span className="text-status-absent">{t("statusFailed")}</span>;
        }
        return <span className="text-status-late">{t("statusPending")}</span>;
      },
    },
    { accessorKey: "attempt_count", header: t("columns.attempts") },
    {
      id: "reason",
      header: t("columns.reason"),
      cell: ({ row }) => (
        <span className="text-fg-muted">
          {row.original.last_error ||
            (row.original.last_status_code ? `HTTP ${row.original.last_status_code}` : "-")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        row.original.status === "failed" ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCw />}
            onClick={() => void handleRetry(row.original)}
          >
            {t("retry")}
          </Button>
        ) : null,
    },
  ];

  const items = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filterEndpoint")}</span>
          <Select
            options={[
              { value: "all", label: t("filterEndpointAll") },
              ...(endpoints.data?.data ?? []).map((endpoint) => ({
                value: endpoint.id,
                label: endpoint.url,
              })),
            ]}
            value={endpointId || "all"}
            onValueChange={(value) => {
              onEndpointChange(value === "all" ? "" : value);
              resetPaging();
            }}
            aria-label={t("filterEndpoint")}
            className="w-72"
          />
        </label>
      </div>

      <DataTable
        stateKey="features/integrations/components/webhook-deliveries-panel:1"
        mode="cursor"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 20 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(delivery) => delivery.id}
        emptyState={
          <EmptyState
            icon={<History aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursors.length <= 1}
          onClick={() => {
            setCursors((prev) => prev.slice(0, -1));
          }}
        >
          {t("pagePrev")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.page.next_cursor}
          onClick={() => {
            const next = data?.page.next_cursor;
            if (next) setCursors((prev) => [...prev, next]);
          }}
        >
          {t("pageNext")}
        </Button>
      </div>
    </div>
  );
}
