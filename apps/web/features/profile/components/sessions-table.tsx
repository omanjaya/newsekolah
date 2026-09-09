"use client";

import type { components } from "@newsekolah/api-client";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import { Badge, ConfirmDialog, DataTable, EmptyState, IconButton, useToast } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { LogOut, Monitor, Smartphone, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useRevokeSessionMutation, useSessionsQuery } from "../api";

type Session = components["schemas"]["Session"];

const CLIENT_ICON = { web: Monitor, ios: Smartphone, android: Smartphone } as const;

export function SessionsTable(): ReactElement {
  const t = useTranslations("app.profile");
  const tAuth = useTranslations("auth.sessions");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading } = useSessionsQuery();
  const revokeMutation = useRevokeSessionMutation();
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();

  const [globalFilter, setGlobalFilter] = useState("");
  const [pendingRevoke, setPendingRevoke] = useState<Session | null>(null);

  const filtered = useMemo(() => {
    const sessions = data?.data ?? [];
    const query = globalFilter.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) =>
      [session.device_name, session.ip, session.client].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [data, globalFilter]);

  const columns = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        accessorKey: "device_name",
        header: t("sessionsColumnDevice"),
        enableSorting: false,
        cell: ({ row }) => {
          const session = row.original;
          const Icon = CLIENT_ICON[session.client];
          return (
            <div className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <span>{session.device_name ?? session.client}</span>
              {session.is_current && <Badge variant="accent">{tAuth("currentDevice")}</Badge>}
            </div>
          );
        },
      },
      {
        accessorKey: "last_seen_at",
        header: t("sessionsColumnLastSeen"),
        enableSorting: false,
        cell: ({ row }) =>
          formatRelative(row.original.last_seen_at, { locale, timeZone: me?.tenant.timezone }),
      },
      {
        id: "actions",
        header: t("sessionsColumnActions"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.is_current ? null : (
            <IconButton
              icon={<LogOut />}
              aria-label={tAuth("revoke")}
              onClick={() => {
                setPendingRevoke(row.original);
              }}
            />
          ),
      },
    ],
    [t, tAuth, locale, me?.tenant.timezone],
  );

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    try {
      await revokeMutation.mutateAsync(pendingRevoke.id);
      toast.success(t("revokeSuccess"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setPendingRevoke(null);
    }
  }

  return (
    <>
      <DataTable
        data={filtered}
        columns={columns}
        rowCount={filtered.length}
        pagination={{ pageIndex: 0, pageSize: 20 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        isLoading={isLoading}
        getRowId={(session) => session.id}
        emptyState={
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title={t("sessionsEmptyTitle")}
            description={t("sessionsEmptyBody")}
          />
        }
      />
      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
        title={tAuth("revokeConfirmTitle")}
        description={tAuth("revokeConfirmBody")}
        confirmLabel={tAuth("revoke")}
        destructive
        confirming={revokeMutation.isPending}
        onConfirm={confirmRevoke}
      />
    </>
  );
}
