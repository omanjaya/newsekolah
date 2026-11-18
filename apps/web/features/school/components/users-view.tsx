"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FilteredEmptyState,
  RowActionsMenu,
  domainIcons,
  cn,
  type RowActionsMenuItem,
  useToast,
  type DataTableFilterDef,
  type DataTableProps,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  KeyRound,
  Pencil,
  Plus,
  Upload,
  VenetianMask,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { ServerAccessCookieError } from "../../../lib/session/clear-server-access-cookie";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import {
  type AdminUser,
  type ProfileKind,
  type UserStatus,
  useArchiveUserMutation,
  useRolesQuery,
  useUsersQuery,
} from "../api";
import { useImpersonateUserMutation } from "../duties-api";

import { ResetPasswordFlow } from "./reset-password-flow";
import { UserRolesCell, UserStatusCell } from "./user-cells";
import { UserForm } from "./user-form";

const KINDS: ProfileKind[] = ["teacher", "staff", "student"];
const KIND_VALUES = ["", ...KINDS] as const;
const STATUSES: UserStatus[] = ["active", "inactive", "invited"];
const STATUS_VALUES = ["", ...STATUSES] as const;
const ARCHIVED_VALUES = ["", "true"] as const;

type Density = NonNullable<DataTableProps<AdminUser>["density"]>;

export function UsersView(): ReactElement {
  const t = useTranslations("app.school.users");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const router = useRouter();
  const { me } = useSession();
  const canCreate = useCan("create_users");
  const canEdit = useCan("edit_users");
  const canArchive = useCan("delete_users");
  const canImpersonate = useCan("impersonate_users");
  const impersonate = useImpersonateUserMutation();
  const [impersonating, setImpersonating] = useState<AdminUser | null>(null);

  const [search, setSearch] = useRememberedViewState("users-search", "");
  const [kind, setKind] = useUrlState<(typeof KIND_VALUES)[number]>("kind", KIND_VALUES, "");
  const [status, setStatus] = useUrlState<(typeof STATUS_VALUES)[number]>(
    "status",
    STATUS_VALUES,
    "",
  );
  const [role, setRole] = useUrlState<string>("role", () => true, "");
  const [includeArchivedParam, setIncludeArchivedParam] = useUrlState<
    (typeof ARCHIVED_VALUES)[number]
  >("include_archived", ARCHIVED_VALUES, "");
  const includeArchived = includeArchivedParam === "true";
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";
  const resetPagination = () => {
    setCursors([""]);
  };
  const { data, error, isLoading, isRefetching, refetch } = useUsersQuery({
    q: search || undefined,
    profile_kind: kind || undefined,
    status: status || undefined,
    role: role || undefined,
    include_archived: includeArchived,
    cursor: cursor || undefined,
  });
  const roles = useRolesQuery();
  const archive = useArchiveUserMutation();
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  // A school has hundreds of accounts, so the list starts compact (one
  // line per person) and the toolbar's toggle still opens it up.
  const [density, setDensity] = useState<Density>("compact");
  const compact = density === "compact";
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const roleOptions = (roles.data?.data ?? []).map((r) => ({ value: r.slug, label: r.name }));

  const filters: DataTableFilterDef[] = [
    {
      id: "kind",
      label: t("filters.kind"),
      value: kind,
      onChange: (value) => {
        setKind(value as (typeof KIND_VALUES)[number]);
        resetPagination();
      },
      options: KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })),
    },
    {
      id: "status",
      label: t("filters.status"),
      value: status,
      onChange: (value) => {
        setStatus(value as (typeof STATUS_VALUES)[number]);
        resetPagination();
      },
      options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
    {
      id: "role",
      label: t("filters.role"),
      value: role,
      onChange: (value) => {
        setRole(value);
        resetPagination();
      },
      options: roleOptions,
    },
    {
      id: "includeArchived",
      label: t("includeArchived"),
      value: includeArchivedParam,
      onChange: (value) => {
        setIncludeArchivedParam(value as (typeof ARCHIVED_VALUES)[number]);
        resetPagination();
      },
      type: "boolean",
      activeValue: "true",
    },
  ];

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title", skeleton: "avatar" },
        // A compact table row is 40px, so from md up the name and the
        // username share one line instead of stacking against its borders;
        // the phone card (which has no density) keeps the two lines.
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size={32} name={row.original.name} />
            <div
              className={cn(
                "flex min-w-0 flex-col",
                compact && "md:flex-row md:items-baseline md:gap-2",
              )}
            >
              <span className="truncate text-fg">{row.original.name}</span>
              <span className="truncate text-caption text-fg-muted">
                {row.original.username}
                {row.original.email ? ` · ${row.original.email}` : ""}
              </span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "profile_kind",
        header: t("columns.kind"),
        enableSorting: false,
        meta: { card: "meta" },
        cell: ({ row }) => t(`kinds.${row.original.profile_kind}`),
      },
      {
        id: "roles",
        header: t("columns.roles"),
        enableSorting: false,
        meta: { card: "meta", label: t("columns.roles") },
        cell: ({ row }) => <UserRolesCell user={row.original} />,
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => <UserStatusCell user={row.original} />,
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original;
          const restore = user.status === "inactive";
          const items: RowActionsMenuItem[] = [
            ...(canEdit
              ? [
                  {
                    label: t("actions.edit"),
                    icon: <Pencil />,
                    onClick: () => {
                      setEditing(user);
                    },
                  },
                  {
                    label: t("actions.resetPassword"),
                    icon: <KeyRound />,
                    onClick: () => {
                      setResetting(user);
                    },
                  },
                ]
              : []),
            ...(canImpersonate && user.status === "active" && user.id !== me?.id
              ? [
                  {
                    label: t("actions.impersonate"),
                    icon: <VenetianMask />,
                    onClick: () => {
                      setImpersonating(user);
                    },
                  },
                ]
              : []),
            ...(canArchive
              ? [
                  {
                    label: restore ? t("actions.restore") : t("actions.archive"),
                    icon: restore ? <ArchiveRestore /> : <Archive />,
                    tone: restore ? ("default" as const) : ("danger" as const),
                    onClick: () => {
                      archive.mutate(
                        { id: user.id, restore },
                        {
                          onSuccess: () => {
                            toast.success(restore ? t("actions.restored") : t("actions.archived"));
                          },
                          onError: fail,
                        },
                      );
                    },
                  },
                ]
              : []),
          ];
          return items.length > 0 ? (
            <RowActionsMenu ariaLabel={t("actions.menuFor", { name: user.name })} items={items} />
          ) : null;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail/reset/archive are stable enough per render
    [t, canEdit, canArchive, canImpersonate, me?.id, compact],
  );

  const items = data?.data ?? [];
  const filtering = Boolean(search || kind || status || role || includeArchived);
  const clearFilters = () => {
    setSearch("");
    setKind("");
    setStatus("");
    setRole("");
    setIncludeArchivedParam("");
    resetPagination();
  };
  const openCreate = () => {
    setEditing("new");
  };
  const addButton = (
    <Button icon={<Plus />} onClick={openCreate}>
      {t("actions.create")}
    </Button>
  );
  const addCompact = { icon: <Plus />, label: t("actions.create"), onSelect: openCreate };

  return (
    // Viewport-fit: the table scrolls inside; the tabs are the area strip the roles page shares.
    <AppPage
      variant="fit"
      nav={<AcademicWorkspaceLinks area="users" />}
      primaryAction={canCreate ? addButton : undefined}
      primaryActionCompact={canCreate ? addCompact : undefined}
      secondaryActions={
        canCreate
          ? [{ label: t("actions.import"), icon: <Upload />, href: "/school/users/import" }]
          : undefined
      }
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/school/components/users-view:1"
          mode="cursor"
          data={items}
          columns={columns}
          cursorPagination={{
            hasPrevious: cursors.length > 1,
            hasNext: Boolean(data?.next_cursor),
            onPrevious: () => {
              setCursors((previous) => previous.slice(0, -1));
            },
            onNext: () => {
              const next = data?.next_cursor;
              if (next) setCursors((previous) => [...previous, next]);
            },
            page: cursors.length,
            pageSize: 50,
          }}
          globalFilter={search}
          onGlobalFilterChange={(v) => {
            setSearch(v);
            resetPagination();
          }}
          filters={filters}
          filtersLabels={{
            reset: t("filters.reset"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
          }}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          getRowId={(u) => u.id}
          density={density}
          onDensityChange={setDensity}
          fillHeight
          emptyState={
            filtering ? (
              <FilteredEmptyState onReset={clearFilters} />
            ) : (
              <EmptyState
                icon={<domainIcons.users aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
                action={canCreate ? addButton : undefined}
              />
            )
          }
        />
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}
          size="lg"
        >
          {editing !== null && (
            <UserForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ResetPasswordFlow
        user={resetting}
        onClose={() => {
          setResetting(null);
        }}
      />

      <ConfirmDialog
        open={impersonating !== null}
        onOpenChange={(open) => {
          if (!open) setImpersonating(null);
        }}
        title={t("actions.impersonate")}
        description={
          impersonating ? t("actions.impersonateBody", { name: impersonating.name }) : ""
        }
        confirmLabel={t("actions.impersonate")}
        tone="danger"
        confirming={impersonate.isPending}
        onConfirm={async () => {
          if (!impersonating) return;
          try {
            await impersonate.mutateAsync(impersonating.id);
            router.replace("/dashboard");
          } catch (error) {
            if (error instanceof ServerAccessCookieError) {
              toast.error(t("actions.impersonatePrepareFailed"));
            } else {
              fail(error);
            }
            setImpersonating(null);
          }
        }}
      />
    </AppPage>
  );
}
