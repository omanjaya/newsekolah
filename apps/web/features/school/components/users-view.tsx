"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
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
  IconButton,
  PageHeader,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { CursorPagination } from "../../../components/cursor-pagination";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import {
  type AdminUser,
  type ProfileKind,
  type UserStatus,
  useArchiveUserMutation,
  useResetPasswordMutation,
  useRolesQuery,
  useUsersQuery,
} from "../api";
import { useImpersonateUserMutation } from "../duties-api";

import { UserForm } from "./user-form";
import { UsersTableEmptyState } from "./users-table-empty-state";

const KINDS: ProfileKind[] = ["teacher", "staff", "student"];
const KIND_VALUES = ["", ...KINDS] as const;
const STATUSES: UserStatus[] = ["active", "inactive", "invited"];
const STATUS_VALUES = ["", ...STATUSES] as const;
const ARCHIVED_VALUES = ["", "true"] as const;

export function UsersView(): ReactElement {
  const tWorkspace = useTranslations("app.academic.workspace");
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
  const { data, isError, isLoading, refetch } = useUsersQuery({
    q: search || undefined,
    profile_kind: kind || undefined,
    status: status || undefined,
    role: role || undefined,
    include_archived: includeArchived,
    cursor: cursor || undefined,
  });
  const roles = useRolesQuery();
  const archive = useArchiveUserMutation();
  const reset = useResetPasswordMutation();
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

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
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar size="sm" name={row.original.name} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-fg">{row.original.name}</span>
              <span className="truncate text-[12px] text-fg-muted">
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
        cell: ({ row }) => t(`kinds.${row.original.profile_kind}`),
      },
      {
        id: "roles",
        header: t("columns.roles"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((role) => (
              <Badge key={role.id} variant={role.is_primary ? "accent" : "neutral"}>
                {role.name}
              </Badge>
            ))}
          </div>
        ),
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
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={<MoreHorizontal />} aria-label={t("actions.menu")} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(user);
                    }}
                  >
                    {t("actions.edit")}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem
                    onSelect={() => {
                      reset.mutate(user.id, {
                        onSuccess: (r) => {
                          setResetToken(r.set_password_token);
                        },
                        onError: fail,
                      });
                    }}
                  >
                    {t("actions.resetPassword")}
                  </DropdownMenuItem>
                )}
                {canArchive && (
                  <DropdownMenuItem
                    onSelect={() => {
                      const restore = user.status === "inactive";
                      archive.mutate(
                        { id: user.id, restore },
                        {
                          onSuccess: () => {
                            toast.success(restore ? t("actions.restored") : t("actions.archived"));
                          },
                          onError: fail,
                        },
                      );
                    }}
                  >
                    {user.status === "inactive" ? t("actions.restore") : t("actions.archive")}
                  </DropdownMenuItem>
                )}
                {canImpersonate && user.status === "active" && user.id !== me?.id && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setImpersonating(user);
                    }}
                  >
                    {t("actions.impersonate")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail/reset/archive are stable enough per render
    [t, canEdit, canArchive, canImpersonate, me?.id],
  );

  const items = data?.data ?? [];

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // filter row and pagination stay put. See classes-view.tsx for the
    // reference pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <AcademicWorkspaceLinks area="users" />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={tWorkspace("users")}
        actions={
          canCreate && (
            <div className="flex gap-2">
              <Button asChild variant="secondary" size="sm" icon={<Upload />}>
                <Link href="/school/users/import">{t("actions.import")}</Link>
              </Button>
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setEditing("new");
                }}
              >
                {t("actions.create")}
              </Button>
            </div>
          )
        }
      />
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/school/components/users-view:1"
          mode="cursor"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
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
          getRowId={(u) => u.id}
          fillHeight
          emptyState={
            <UsersTableEmptyState
              isError={isError}
              emptyTitle={t("emptyTitle")}
              emptyBody={t("emptyBody")}
              loadErrorTitle={t("loadErrorTitle")}
              loadErrorBody={t("loadErrorBody")}
              retryLabel={t("retry")}
              onRetry={() => {
                void refetch();
              }}
            />
          }
        />
      </div>
      <CursorPagination
        hasPrevious={cursors.length > 1}
        hasNext={Boolean(data?.next_cursor)}
        previousLabel={t("pagePrev")}
        nextLabel={t("pageNext")}
        onPrevious={() => {
          setCursors((previous) => previous.slice(0, -1));
        }}
        onNext={() => {
          const next = data?.next_cursor;
          if (next) setCursors((previous) => [...previous, next]);
        }}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}
          className="max-w-2xl"
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
      <Dialog
        open={resetToken !== null}
        onOpenChange={(open) => {
          if (!open) setResetToken(null);
        }}
      >
        <DialogContent title={t("resetTitle")}>
          <p className="text-[13px] text-fg-muted">{t("resetBody")}</p>
          <code className="mt-3 block rounded-xs bg-bg p-3 text-[12px] break-all">
            {typeof window !== "undefined"
              ? `${window.location.origin}/reset-password?token=${resetToken ?? ""}`
              : resetToken}
          </code>
        </DialogContent>
      </Dialog>

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
        destructive
        confirming={impersonate.isPending}
        onConfirm={async () => {
          if (!impersonating) return;
          try {
            await impersonate.mutateAsync(impersonating.id);
            router.replace("/dashboard");
          } catch (error) {
            fail(error);
            setImpersonating(null);
          }
        }}
      />
    </div>
  );
}
