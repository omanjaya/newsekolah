"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, useToast } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type APIKey, useAPIKeysQuery, useRevokeAPIKeyMutation } from "../api";

import { CreateAPIKeyDialog } from "./create-api-key-dialog";

export function APIKeysPanel(): ReactElement {
  const t = useTranslations("app.integrations.apiKeys");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const { data, isLoading } = useAPIKeysQuery();
  const revoke = useRevokeAPIKeyMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<APIKey | null>(null);

  async function confirmRevoke() {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      toast.success(t("revoked"));
      setRevoking(null);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const columns: ColumnDef<APIKey>[] = [
    { accessorKey: "name", header: t("columns.name") },
    {
      id: "permissions",
      header: t("columns.permissions"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.permissions.map((code) => (
            <Badge key={code} variant="neutral">
              {code}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: t("columns.status"),
      cell: ({ row }) => {
        const key = row.original;
        if (key.revoked_at) {
          return <span className="text-status-absent">{t("statusRevoked")}</span>;
        }
        if (key.expires_at && new Date(key.expires_at) <= new Date()) {
          return <span className="text-status-late">{t("statusExpired")}</span>;
        }
        return <span className="text-status-present">{t("statusActive")}</span>;
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
      header: "",
      cell: ({ row }) =>
        row.original.revoked_at ? null : (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setRevoking(row.original);
            }}
          >
            {t("revoke")}
          </Button>
        ),
    },
  ];

  const items = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-fg-muted">{t("description")}</p>
        <Button
          size="sm"
          className="shrink-0 self-start sm:self-auto"
          icon={<Plus />}
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          {t("createButton")}
        </Button>
      </div>

      <DataTable
        stateKey="features/integrations/components/api-keys-panel:1"
        mode="local"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(key) => key.id}
        emptyState={
          <EmptyState
            icon={<KeyRound aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
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
        destructive
        confirming={revoke.isPending}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
