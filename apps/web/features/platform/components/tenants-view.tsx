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
  EmptyState,
  FilteredEmptyState,
  RowActionsMenu,
  Stat,
  StatGrid,
  type DataTableFilterDef,
  type RowActionsMenuItem,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Building2,
  CircleCheck,
  CirclePause,
  FlaskConical,
  MoonStar,
  PanelRightOpen,
  Play,
  Plus,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
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
import { PlatformNav } from "./platform-nav";
import { TenantCredentialsDialog } from "./tenant-credentials-dialog";
import { TenantDetailSheet } from "./tenant-detail-panel";
import { EDUCATION_LEVELS, TENANT_STATUS_TONE, isIdle } from "./tenant-status";

const STATUSES = ["active", "trial", "suspended", "offboarding"] as const;

/**
 * The operator console: a strip of the deployment's health (schools,
 * active, trial, suspended, idle for a week), then every school in one
 * searchable, filterable table. A row opens the school in a side sheet;
 * suspending asks first, naming the school and its users.
 */
export function TenantsView(): ReactElement {
  const t = useTranslations("app.platform.tenants");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const tenants = useTenantsQuery();
  const suspend = useSuspendTenantMutation();
  const resume = useResumeTenantMutation();

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PlatformTenantCreated | null>(null);
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);
  // Suspending locks every user of a school out at once, so it is confirmed first.
  const [suspendTarget, setSuspendTarget] = useState<PlatformTenantHealth | null>(null);
  const [status, setStatus] = useState("");
  const [level, setLevel] = useState("");

  const all = useMemo(() => tenants.data?.data ?? [], [tenants.data]);
  // A failed read with no error object still counts as failed.
  const loadError: unknown = tenants.error ?? true;
  const items = all.filter(
    (tenant) =>
      (status === "" || tenant.status === status) &&
      (level === "" || tenant.education_level === level),
  );
  const counts = {
    total: all.length,
    active: all.filter((tenant) => tenant.status === "active").length,
    trial: all.filter((tenant) => tenant.status === "trial").length,
    suspended: all.filter((tenant) => tenant.status === "suspended").length,
    idle: all.filter((tenant) => isIdle(tenant.last_activity_at)).length,
  };

  const onError = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const columns = useMemo<ColumnDef<PlatformTenantHealth>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: true,
        meta: { card: "title", skeleton: "lines" },
        cell: ({ row }) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-fg">{row.original.name}</span>
            <span className="truncate text-caption text-fg-muted">
              {row.original.primary_domain ?? row.original.slug}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge size="sm" tone={TENANT_STATUS_TONE[row.original.status]}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: "education_level",
        header: t("columns.level"),
        enableSorting: false,
        meta: { card: "meta" },
        cell: ({ row }) => t(`level.${row.original.education_level}`),
      },
      {
        accessorKey: "user_count",
        header: t("columns.users"),
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.user_count.toLocaleString(locale)}</span>
        ),
      },
      {
        accessorKey: "active_academic_year",
        header: t("columns.activeYear"),
        enableSorting: false,
        cell: ({ row }) => row.original.active_academic_year ?? "-",
      },
      {
        accessorKey: "last_activity_at",
        header: t("columns.lastActivity"),
        enableSorting: true,
        cell: ({ row }) => {
          const at = row.original.last_activity_at;
          return (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {at ? formatDateTime(at, { locale, timeZone }) : t("never")}
              {isIdle(at) && (
                <Badge size="sm" tone="warning">
                  {t("idle")}
                </Badge>
              )}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const tenant = row.original;
          const menu: RowActionsMenuItem[] = [
            {
              label: t("viewDetail"),
              icon: <PanelRightOpen />,
              onClick: () => {
                setDetailTenantId(tenant.id);
              },
            },
            tenant.status === "suspended"
              ? {
                  label: t("resume"),
                  icon: <Play />,
                  onClick: () => {
                    resume.mutate(tenant.id, {
                      onSuccess: () => {
                        toast.success(t("resumed"));
                      },
                      onError,
                    });
                  },
                }
              : {
                  label: t("suspend"),
                  icon: <CirclePause />,
                  tone: "danger",
                  onClick: () => {
                    setSuspendTarget(tenant);
                  },
                },
          ];
          return <RowActionsMenu ariaLabel={t("rowActions", { name: tenant.name })} items={menu} />;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the mutations and toast are stable
    [t, locale, timeZone],
  );

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("columns.status"),
      value: status,
      onChange: setStatus,
      options: STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
    },
    {
      id: "level",
      label: t("columns.level"),
      value: level,
      onChange: setLevel,
      options: EDUCATION_LEVELS.map((value) => ({ value, label: t(`level.${value}`) })),
    },
  ];

  const addButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t("add")}
    </Button>
  );

  return (
    <AppPage
      variant="wide"
      description={t("subtitle")}
      nav={<PlatformNav />}
      primaryAction={addButton}
      primaryActionCompact={{
        icon: <Plus />,
        label: t("add"),
        onSelect: () => {
          setCreating(true);
        },
      }}
    >
      <StatGrid variant="strip" aria-label={t("summaryLabel")}>
        <Stat
          icon={<Building2 />}
          tone="green"
          label={t("summary.total")}
          value={counts.total}
          loading={tenants.isLoading}
        />
        <Stat
          icon={<CircleCheck />}
          tone="blue"
          label={t("summary.active")}
          value={counts.active}
          loading={tenants.isLoading}
          onClick={() => {
            setStatus("active");
          }}
        />
        <Stat
          icon={<FlaskConical />}
          tone="purple"
          label={t("summary.trial")}
          value={counts.trial}
          loading={tenants.isLoading}
          onClick={() => {
            setStatus("trial");
          }}
        />
        <Stat
          icon={<CirclePause />}
          tone="red"
          label={t("summary.suspended")}
          value={counts.suspended}
          loading={tenants.isLoading}
          onClick={() => {
            setStatus("suspended");
          }}
        />
        <Stat
          icon={<MoonStar />}
          tone="amber"
          label={t("summary.idle")}
          hint={t("summary.idleHint")}
          value={counts.idle}
          loading={tenants.isLoading}
        />
      </StatGrid>

      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        stateKey="features/platform/components/tenants-view:2"
        mode="local"
        data={items}
        columns={columns}
        filters={filters}
        isLoading={tenants.isLoading}
        error={tenants.isError && !tenants.data ? loadError : undefined}
        onRetry={() => void tenants.refetch()}
        retrying={tenants.isRefetching}
        getRowId={(item) => item.id}
        onRowActivate={(item) => {
          setDetailTenantId(item.id);
        }}
        emptyState={
          status !== "" || level !== "" ? (
            <FilteredEmptyState
              onReset={() => {
                setStatus("");
                setLevel("");
              }}
            />
          ) : (
            <EmptyState
              icon={<Building2 aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              action={addButton}
            />
          )
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
        tone="danger"
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

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("create.title")} size="md">
          {creating && (
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
          )}
        </DialogContent>
      </Dialog>

      <TenantCredentialsDialog
        created={created}
        onClose={() => {
          setCreated(null);
        }}
      />

      <TenantDetailSheet
        tenantId={detailTenantId}
        onOpenChange={(open) => {
          if (!open) setDetailTenantId(null);
        }}
      />
    </AppPage>
  );
}
