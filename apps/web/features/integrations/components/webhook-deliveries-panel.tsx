"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilteredEmptyState,
  useToast,
  deliveryStatusTone,
  type DataTableFilterDef,
} from "@newsekolah/ui";
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

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<WebhookDelivery["status"], string> = {
  success: "statusSuccess",
  failed: "statusFailed",
  pending: "statusPending",
};

/** Every delivery attempt to the school's webhooks, newest first, filterable by endpoint; a failed one can be retried. */
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
  const { data, isLoading, isError, error, refetch, isRefetching } = useWebhookDeliveriesQuery(
    endpointId,
    cursor,
  );
  const retry = useRetryWebhookDeliveryMutation();

  function resetPaging() {
    setCursors([""]);
  }

  async function handleRetry(delivery: WebhookDelivery) {
    try {
      await retry.mutateAsync(delivery.id);
      toast.success(t("retryEnqueued"));
    } catch (err) {
      toast.error(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const columns: ColumnDef<WebhookDelivery>[] = [
    {
      accessorKey: "event_type",
      header: t("columns.eventType"),
      meta: { card: "title" },
      cell: ({ row }) => <span className="font-mono text-body-sm">{row.original.event_type}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      meta: { card: "meta", skeleton: "badge" },
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge size="sm" tone={deliveryStatusTone(status)}>
            {t(STATUS_LABEL[status])}
          </Badge>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: t("columns.when"),
      meta: { card: "subtitle" },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.original.created_at, { locale, timeZone })}
        </span>
      ),
    },
    {
      accessorKey: "attempt_count",
      header: t("columns.attempts"),
      meta: { align: "end" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.attempt_count}</span>,
    },
    {
      id: "reason",
      header: t("columns.reason"),
      cell: ({ row }) => {
        const { last_error: lastError, last_status_code: statusCode } = row.original;
        const reason = lastError !== "" ? lastError : statusCode ? `HTTP ${statusCode}` : "-";
        return <span className="text-fg-muted">{reason}</span>;
      },
    },
    {
      id: "actions",
      header: t("columns.actions"),
      cell: ({ row }) =>
        row.original.status === "failed" ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCw />}
            loading={retry.isPending && retry.variables === row.original.id}
            onClick={() => void handleRetry(row.original)}
          >
            {t("retry")}
          </Button>
        ) : null,
    },
  ];

  const items = data?.data ?? [];
  // A failed read with no error object still counts as failed.
  const failure: unknown = error;
  const loadError = isError && !data ? (failure ?? true) : undefined;

  const filters: DataTableFilterDef[] = [
    {
      id: "endpoint",
      label: t("filterEndpoint"),
      value: endpointId,
      onChange: (value) => {
        onEndpointChange(value);
        resetPaging();
      },
      options: (endpoints.data?.data ?? []).map((endpoint) => ({
        value: endpoint.id,
        label: endpoint.url,
      })),
    },
  ];

  return (
    <DataTable
      stateKey="features/integrations/components/webhook-deliveries-panel:2"
      mode="cursor"
      data={items}
      columns={columns}
      searchable={false}
      filters={filters}
      isLoading={isLoading}
      // A failed read keeps the filter bar, so a bad filter can still be changed.
      error={loadError}
      onRetry={() => void refetch()}
      retrying={isRefetching}
      getRowId={(delivery) => delivery.id}
      cursorPagination={{
        hasPrevious: cursors.length > 1,
        hasNext: Boolean(data?.page.next_cursor),
        onPrevious: () => {
          setCursors((prev) => prev.slice(0, -1));
        },
        onNext: () => {
          const next = data?.page.next_cursor;
          if (next) setCursors((prev) => [...prev, next]);
        },
        page: cursors.length,
        pageSize: PAGE_SIZE,
      }}
      emptyState={
        endpointId !== "" ? (
          <FilteredEmptyState
            onReset={() => {
              onEndpointChange("");
              resetPaging();
            }}
          />
        ) : (
          <EmptyState
            icon={<History aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        )
      }
    />
  );
}
