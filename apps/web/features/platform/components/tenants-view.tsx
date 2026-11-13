"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  PageHeader,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, MoreHorizontal, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type PlatformTenantCreated,
  type PlatformTenantHealth,
  useResumeTenantMutation,
  useSuspendTenantMutation,
  useTenantsQuery,
} from "../api";

import { CreateTenantForm } from "./create-tenant-form";
import { TenantDetailPanel } from "./tenant-detail-panel";

export function TenantsView(): ReactElement {
  const t = useTranslations("app.platform.tenants");
  const tCreated = useTranslations("app.platform.tenants.created");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const { data, isLoading } = useTenantsQuery();
  const suspend = useSuspendTenantMutation();
  const resume = useResumeTenantMutation();

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PlatformTenantCreated | null>(null);
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);
  // Suspending locks every user of a school out at once, so it is confirmed first.
  const [suspendTarget, setSuspendTarget] = useState<PlatformTenantHealth | null>(null);

  const items = data?.data ?? [];

  const onError = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const columns = useMemo<ColumnDef<PlatformTenantHealth>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        accessorKey: "education_level",
        header: t("columns.level"),
        enableSorting: false,
        cell: ({ row }) => t(`level.${row.original.education_level}`),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      { accessorKey: "user_count", header: t("columns.users"), enableSorting: false },
      {
        accessorKey: "active_academic_year",
        header: t("columns.activeYear"),
        enableSorting: false,
        cell: ({ row }) => row.original.active_academic_year ?? "-",
      },
      {
        accessorKey: "last_activity_at",
        header: t("columns.lastActivity"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.last_activity_at
            ? formatDateTime(row.original.last_activity_at, { locale, timeZone })
            : t("never"),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const tenant = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={<MoreHorizontal />} aria-label={t("columns.actions")} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setDetailTenantId(tenant.id);
                  }}
                >
                  {t("viewDetail")}
                </DropdownMenuItem>
                {tenant.status === "suspended" ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      resume.mutate(tenant.id, {
                        onSuccess: () => {
                          toast.success(t("resumed"));
                        },
                        onError,
                      });
                    }}
                  >
                    {t("resume")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => {
                      setSuspendTarget(tenant);
                    }}
                  >
                    {t("suspend")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, timeZone],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("add")}
          </Button>
        }
      />
      <p className="text-[13px] text-fg-muted">{t("subtitle")}</p>

      <DataTable
        stateKey="features/platform/components/tenants-view:1"
        mode="local"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(item) => item.id}
        onRowActivate={(item) => {
          setDetailTenantId(item.id);
        }}
        emptyState={
          <EmptyState
            icon={<Building2 aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <ConfirmDialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null);
        }}
        title={t("suspendDialog.title")}
        description={t("suspendDialog.body", {
          name: suspendTarget?.name ?? "",
          count: suspendTarget?.user_count ?? 0,
        })}
        confirmLabel={t("suspend")}
        destructive
        confirming={suspend.isPending}
        onConfirm={() => {
          if (!suspendTarget) return;
          suspend.mutate(suspendTarget.id, {
            onSuccess: () => {
              toast.success(t("suspended"));
            },
            onError,
            onSettled: () => {
              setSuspendTarget(null);
            },
          });
        }}
      />

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
        }}
      >
        <DialogContent title={t("create.title")}>
          <CreateTenantForm
            onCreated={(result) => {
              setCreating(false);
              setCreated(result);
              toast.success(t("create.created"));
            }}
            onCancel={() => {
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) setCreated(null);
        }}
      >
        <DialogContent title={tCreated("title")}>
          {created && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-fg-muted">{tCreated("body")}</p>
              <dl className="flex flex-col gap-2 rounded-sm border border-border p-3 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">{tCreated("username")}</dt>
                  <dd className="font-mono">{created.admin_username}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">{tCreated("password")}</dt>
                  <dd className="font-mono">{created.admin_password}</dd>
                </div>
              </dl>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setCreated(null);
                  }}
                >
                  {tCreated("done")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailTenantId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailTenantId(null);
        }}
      >
        <DialogContent title={t("detail.title")}>
          {detailTenantId && <TenantDetailPanel tenantId={detailTenantId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
