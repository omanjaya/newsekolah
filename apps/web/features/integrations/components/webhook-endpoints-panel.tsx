"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  RowActionsMenu,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { History, Pencil, Plus, Trash2, Webhook } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type WebhookEndpoint,
  useDeleteWebhookEndpointMutation,
  useWebhookEndpointsQuery,
} from "../api";
import { useWebhookEventLabel } from "../lib/use-webhook-event-label";

import { WebhookEndpointDialog } from "./webhook-endpoint-dialog";

/** Event badges shown in a row before the rest collapse into "+N". */
const SHOWN_EVENTS = 2;

/** The school's webhook endpoints: the URL, what it listens to, its state, and a row menu. */
export function WebhookEndpointsPanel({
  onSelectEndpoint,
}: {
  /** Lets the delivery log tab jump straight to one endpoint's history. */
  onSelectEndpoint: (endpointId: string) => void;
}): ReactElement {
  const t = useTranslations("app.integrations.webhooks");
  const eventLabel = useWebhookEventLabel();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, isError, error, refetch, isRefetching } = useWebhookEndpointsQuery();
  const deleteEndpoint = useDeleteWebhookEndpointMutation();

  const [dialogTarget, setDialogTarget] = useState<"create" | WebhookEndpoint | null>(null);
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteEndpoint.mutateAsync(deleting.id);
      toast.success(t("deleted"));
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const columns: ColumnDef<WebhookEndpoint>[] = [
    {
      accessorKey: "url",
      header: t("columns.url"),
      meta: { card: "title" },
      cell: ({ row }) => (
        <span className="break-all font-mono text-body-sm text-fg">{row.original.url}</span>
      ),
    },
    {
      id: "eventTypes",
      header: t("columns.eventTypes"),
      meta: { card: "subtitle", label: t("columns.eventTypes") },
      cell: ({ row }) => {
        const events = row.original.event_types;
        const rest = events.length - SHOWN_EVENTS;
        return (
          <span className="flex flex-wrap items-center gap-1" title={events.join(", ")}>
            {events.slice(0, SHOWN_EVENTS).map((eventType) => (
              <Badge key={eventType} size="sm" title={eventType}>
                {eventLabel(eventType)}
              </Badge>
            ))}
            {rest > 0 && (
              <Badge size="sm" appearance="outline">
                {t("moreEvents", { count: rest })}
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      id: "status",
      header: t("columns.status"),
      meta: { card: "meta", skeleton: "badge" },
      cell: ({ row }) => {
        const endpoint = row.original;
        return endpoint.status === "disabled" ? (
          <Badge size="sm" tone="danger" title={endpoint.disabled_reason}>
            {t("statusDisabled")}
          </Badge>
        ) : (
          <Badge size="sm" tone="success">
            {t("statusActive")}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: t("columns.actions"),
      cell: ({ row }) => (
        <RowActionsMenu
          ariaLabel={t("rowActions", { url: row.original.url })}
          items={[
            {
              label: t("viewDeliveries"),
              icon: <History />,
              onClick: () => {
                onSelectEndpoint(row.original.id);
              },
            },
            {
              label: t("edit"),
              icon: <Pencil />,
              onClick: () => {
                setDialogTarget(row.original);
              },
            },
            {
              label: t("delete"),
              icon: <Trash2 />,
              tone: "danger",
              onClick: () => {
                setDeleting(row.original);
              },
            },
          ]}
        />
      ),
    },
  ];

  const items = data?.data ?? [];
  // A failed read with no error object still counts as failed.
  const failure: unknown = error;
  const loadError = isError && !data ? (failure ?? true) : undefined;
  const createButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setDialogTarget("create");
      }}
    >
      {t("create")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-body-sm text-fg-muted">{t("description")}</p>
      <DataTable
        stateKey="features/integrations/components/webhook-endpoints-panel:2"
        mode="local"
        data={items}
        columns={columns}
        searchable={false}
        isLoading={isLoading}
        error={loadError}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(endpoint) => endpoint.id}
        onRowActivate={(endpoint) => {
          setDialogTarget(endpoint);
        }}
        toolbarActions={items.length > 0 ? createButton : undefined}
        emptyState={
          <EmptyState
            icon={<Webhook aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={createButton}
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
        tone="danger"
        confirming={deleteEndpoint.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
