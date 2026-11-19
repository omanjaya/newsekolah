"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
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
import { Ban, KeyRound, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type APIKey, useAPIKeysQuery, useRevokeAPIKeyMutation } from "../api";
import { usePermissionLabel } from "../lib/use-permission-label";

import { CreateAPIKeyDialog } from "./create-api-key-dialog";

/** Permission badges shown in a row before the rest collapse into "+N". */
const SHOWN_PERMISSIONS = 2;

/** The school's API keys: what each may do, its state and last use; revoking asks first. */
export function APIKeysPanel(): ReactElement {
  const t = useTranslations("app.integrations.apiKeys");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const { data, isLoading, isError, error, refetch, isRefetching } = useAPIKeysQuery();
  const permissionLabel = usePermissionLabel();
  const revoke = useRevokeAPIKeyMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<APIKey | null>(null);

  async function confirmRevoke() {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      toast.success(t("revoked"));
      setRevoking(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const columns = useMemo<ColumnDef<APIKey>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        meta: { card: "title" },
        cell: ({ row }) => <span className="font-medium text-fg">{row.original.name}</span>,
      },
      {
        id: "permissions",
        header: t("columns.permissions"),
        meta: { card: "subtitle", label: t("columns.permissions") },
        cell: ({ row }) => {
          const labels = row.original.permissions.map(permissionLabel);
          const rest = labels.length - SHOWN_PERMISSIONS;
          return (
            <span className="flex flex-wrap items-center gap-1" title={labels.join(", ")}>
              {labels.slice(0, SHOWN_PERMISSIONS).map((label) => (
                <Badge key={label} size="sm">
                  {label}
                </Badge>
              ))}
              {rest > 0 && (
                <Badge size="sm" appearance="outline">
                  {t("morePermissions", { count: rest })}
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
          const key = row.original;
          if (key.revoked_at) {
            return (
              <Badge size="sm" tone="danger">
                {t("statusRevoked")}
              </Badge>
            );
          }
          if (key.expires_at && new Date(key.expires_at) <= new Date()) {
            return (
              <Badge size="sm" tone="warning">
                {t("statusExpired")}
              </Badge>
            );
          }
          return (
            <Badge size="sm" tone="success">
              {t("statusActive")}
            </Badge>
          );
        },
      },
      {
        id: "lastUsed",
        header: t("columns.lastUsed"),
        cell: ({ row }) =>
          row.original.last_used_at
            ? formatDateTime(row.original.last_used_at, { locale, timeZone })
            : t("neverUsed"),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) =>
          row.original.revoked_at ? null : (
            <RowActionsMenu
              ariaLabel={t("rowActions", { name: row.original.name })}
              items={[
                {
                  label: t("revoke"),
                  icon: <Ban />,
                  tone: "danger",
                  onClick: () => {
                    setRevoking(row.original);
                  },
                },
              ]}
            />
          ),
      },
    ],
    [t, permissionLabel, locale, timeZone],
  );

  const items = data?.data ?? [];
  // A failed read with no error object still counts as failed.
  const failure: unknown = error;
  const loadError = isError && !data ? (failure ?? true) : undefined;
  const createButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreateOpen(true);
      }}
    >
      {t("createButton")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-body-sm text-fg-muted">{t("description")}</p>
      <DataTable
        stateKey="features/integrations/components/api-keys-panel:2"
        mode="local"
        data={items}
        columns={columns}
        searchable={false}
        isLoading={isLoading}
        error={loadError}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(key) => key.id}
        toolbarActions={items.length > 0 ? createButton : undefined}
        emptyState={
          <EmptyState
            icon={<KeyRound aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={createButton}
          />
        }
      />

      <CreateAPIKeyDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={t("revokeConfirmTitle")}
        description={revoking ? t("revokeConfirmBody", { name: revoking.name }) : ""}
        confirmLabel={t("revoke")}
        tone="danger"
        confirming={revoke.isPending}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
