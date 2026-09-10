"use client";

import { ApiError } from "@newsekolah/api-client";
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
  Select,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  type AdminUser,
  type ProfileKind,
  useArchiveUserMutation,
  useResetPasswordMutation,
  useUsersQuery,
} from "../api";
import { useImpersonateUserMutation } from "../duties-api";

import { GuardiansDialog } from "./guardians-dialog";
import { ManageChildrenDialog } from "./manage-children-dialog";
import { UserForm } from "./user-form";

const KINDS: ProfileKind[] = ["teacher", "staff", "student", "parent"];

export function UsersView(): ReactElement {
  const t = useTranslations("app.school.users");
  const tFamily = useTranslations("app.family.guardianLinks");
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

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ProfileKind | "">("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";
  const { data, isLoading } = useUsersQuery({
    q: search || undefined,
    profile_kind: kind || undefined,
    include_archived: includeArchived,
    cursor: cursor || undefined,
  });
  const archive = useArchiveUserMutation();
  const reset = useResetPasswordMutation();
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [managingChildrenFor, setManagingChildrenFor] = useState<AdminUser | null>(null);
  const [guardiansFor, setGuardiansFor] = useState<AdminUser | null>(null);

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
          <div className="flex flex-col">
            <span className="text-fg">{row.original.name}</span>
            <span className="text-[12px] text-fg-muted">
              {row.original.username}
              {row.original.email ? ` · ${row.original.email}` : ""}
            </span>
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
                {user.profile_kind === "parent" && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setManagingChildrenFor(user);
                    }}
                  >
                    {tFamily("menu.manageChildren")}
                  </DropdownMenuItem>
                )}
                {user.profile_kind === "student" && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setGuardiansFor(user);
                    }}
                  >
                    {tFamily("menu.guardians")}
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
    [t, tFamily, canEdit, canArchive, canImpersonate, me?.id],
  );

  const items = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canCreate && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setEditing("new");
              }}
            >
              {t("actions.create")}
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          options={[
            { value: "all", label: t("kinds.all") },
            ...KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })),
          ]}
          value={kind || "all"}
          onValueChange={(v) => {
            setKind(v === "all" ? "" : (v as ProfileKind));
            setCursors([""]);
          }}
          aria-label={t("columns.kind")}
          className="w-44"
        />
        <Button
          variant={includeArchived ? "primary" : "secondary"}
          size="sm"
          onClick={() => {
            setIncludeArchived((v) => !v);
            setCursors([""]);
          }}
        >
          {t("includeArchived")}
        </Button>
      </div>
      <DataTable
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
          setCursors([""]);
        }}
        isLoading={isLoading}
        getRowId={(u) => u.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.users aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursors.length <= 1}
          onClick={() => {
            setCursors((p) => p.slice(0, -1));
          }}
        >
          {t("pagePrev")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.next_cursor}
          onClick={() => {
            const next = data?.next_cursor;
            if (next) setCursors((p) => [...p, next]);
          }}
        >
          {t("pageNext")}
        </Button>
      </div>

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

      <ManageChildrenDialog
        open={managingChildrenFor !== null}
        onOpenChange={(open) => {
          if (!open) setManagingChildrenFor(null);
        }}
        parentUserId={managingChildrenFor?.id ?? ""}
        parentName={managingChildrenFor?.name ?? ""}
        canEdit={canEdit}
      />
      <GuardiansDialog
        open={guardiansFor !== null}
        onOpenChange={(open) => {
          if (!open) setGuardiansFor(null);
        }}
        studentUserId={guardiansFor?.id ?? ""}
        studentName={guardiansFor?.name ?? ""}
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
