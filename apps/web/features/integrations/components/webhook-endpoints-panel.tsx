"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, useToast } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Webhook } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type WebhookEndpoint,
  useDeleteWebhookEndpointMutation,
  useWebhookEndpointsQuery,
} from "../api";

import { WebhookEndpointDialog } from "./webhook-endpoint-dialog";

export function WebhookEndpointsPanel({
  onSelectEndpoint,
}: {
  /** Lets the delivery log tab jump straight to one endpoint's history. */
  onSelectEndpoint: (endpointId: string) => void;
}): ReactElement {
  const t = useTranslations("app.integrations.webhooks");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading } = useWebhookEndpointsQuery();
  const deleteEndpoint = useDeleteWebhookEndpointMutation();

  const [dialogTarget, setDialogTarget] = useState<"create" | WebhookEndpoint | null>(null);
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteEndpoint.mutateAsync(deleting.id);
      toast.success(t("deleted"));
      setDeleting(null);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const columns: ColumnDef<WebhookEndpoint>[] = [
    { accessorKey: "url", header: t("columns.url") },
    {
      id: "eventTypes",
      header: t("columns.eventTypes"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.event_types.map((eventType) => (
            <Badge key={eventType} variant="neutral">
              {eventType}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: t("columns.status"),
      cell: ({ row }) => {
        const endpoint = row.original;
        return endpoint.status === "disabled" ? (
          <span className="text-status-absent" title={endpoint.disabled_reason}>
            {t("statusDisabled")}
          </span>
        ) : (
          <span className="text-status-present">{t("statusActive")}</span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onSelectEndpoint(row.original.id);
            }}
          >
            {t("viewDeliveries")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDialogTarget(row.original);
            }}
          >
            {t("edit")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setDeleting(row.original);
            }}
          >
            {t("delete")}
          </Button>
        </div>
      ),
    },
  ];

  const items = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-fg-muted">{t("description")}</p>
        <Button
          size="sm"
          onClick={() => {
            setDialogTarget("create");
          }}
        >
          <Plus aria-hidden="true" />
          {t("create")}
        </Button>
      </div>

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(endpoint) => endpoint.id}
        emptyState={
          <EmptyState
            icon={<Webhook aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      {dialogTarget !== null && (
        <WebhookEndpointDialog
          key={dialogTarget === "create" ? "create" : dialogTarget.id}
          open
          onOpenChange={(open) => {
            if (!open) setDialogTarget(null);
          }}
          endpoint={dialogTarget === "create" ? undefined : dialogTarget}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteConfirmTitle")}
        description={deleting ? t("deleteConfirmBody", { url: deleting.url }) : ""}
        confirmLabel={t("delete")}
        destructive
        confirming={deleteEndpoint.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
