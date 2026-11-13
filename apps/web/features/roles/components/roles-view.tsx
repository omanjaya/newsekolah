"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  PageHeader,
  Skeleton,
  cn,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type AdminRole,
  useDeleteRoleMutation,
  usePermissionsQuery,
  useReplaceRolePermissionsMutation,
  useRolesQuery,
} from "../api";

import { CreateRoleForm } from "./create-role-form";

/**
 * identity/domain/errors.go's ErrLeavePermissionDirect: these two codes
 * cannot be granted to the teacher system role directly, only through a
 * duty assignment, so the matrix disables them there instead of letting an
 * admin check a box the server will reject on save.
 */
const DUTY_ONLY_PERMISSIONS = new Set(["review_leave_requests", "issue_leave_letters"]);

/** Roles on the left, the permission matrix of the selected role on the right. */
export function RolesView(): ReactElement {
  const t = useTranslations("app.roles");
  const canManage = useCan("manage_permissions");
  const roles = useRolesQuery();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  // Unsaved checkbox edits are kept per role, so switching roles never
  // silently throws a half-finished edit away.
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const list = roles.data?.data ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  function setDraft(roleId: string, permissions: string[] | undefined) {
    setDrafts((current) => {
      const { [roleId]: _discarded, ...rest } = current;
      return permissions ? { ...rest, [roleId]: permissions } : rest;
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t("addRole")}
            </Button>
          )
        }
      />
      {roles.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : roles.isError && !roles.data ? (
        <QueryError retry={() => roles.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <nav aria-label={t("title")} className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            {list.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-current={selected?.id === r.id ? "true" : undefined}
                onClick={() => {
                  setSelectedId(r.id);
                }}
                className={`flex min-h-11 shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-xs px-3 py-2 text-left text-[14px] ${selected?.id === r.id ? "bg-accent/10 text-accent" : "text-fg hover:bg-bg"}`}
              >
                <span>{r.name}</span>
                {drafts[r.id] && <span className="sr-only">{t("unsaved")}</span>}
                {r.user_count !== undefined && (
                  <span className="text-[12px] text-fg-muted">{r.user_count}</span>
                )}
              </button>
            ))}
          </nav>
          {selected && (
            <RoleMatrix
              key={selected.id}
              role={selected}
              canManage={canManage}
              draft={drafts[selected.id]}
              onDraftChange={(permissions) => {
                setDraft(selected.id, permissions);
              }}
            />
          )}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("addRole")}>
          {creating && (
            <CreateRoleForm
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleMatrix({
  role,
  canManage,
  draft,
  onDraftChange,
}: {
  role: AdminRole;
  canManage: boolean;
  /** Unsaved permission codes for this role, kept by the parent across role switches. */
  draft: string[] | undefined;
  onDraftChange: (permissions: string[] | undefined) => void;
}): ReactElement {
  const t = useTranslations("app.roles");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const permissions = usePermissionsQuery();
  const replace = useReplaceRolePermissionsMutation();
  const remove = useDeleteRoleMutation();
  // Permissions just saved but not yet reflected by the refetched roles list.
  // Without this the boxes would snap back to the old set until the refetch
  // lands, and a toggle in that window would build on the stale set.
  // Only trusted while the list still holds the array it held at save time.
  const [saved, setSaved] = useState<{ permissions: string[]; stale: string[] } | undefined>();
  const base = saved?.stale === role.permissions ? saved.permissions : role.permissions;
  const granted = useMemo(() => new Set(draft ?? base), [draft, base]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = useMemo(() => {
    const original = new Set(base);
    if (original.size !== granted.size) return true;
    for (const code of granted) if (!original.has(code)) return true;
    return false;
  }, [base, granted]);
  const editable = canManage && !role.is_system;

  function save() {
    replace.mutate(
      { id: role.id, permissions: [...granted] },
      {
        onSuccess: () => {
          setSaved({ permissions: [...granted], stale: role.permissions });
          onDraftChange(undefined);
          toast.success(t("saved"));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  function permissionText(code: string, fallback: string): { label: string; description: string } {
    return t.has(`permissions.${code}.label`)
      ? {
          label: t(`permissions.${code}.label`),
          description: t(`permissions.${code}.description`),
        }
      : { label: code, description: fallback };
  }

  return (
    <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-[18px] font-medium text-fg">
            {role.name} {role.is_system && <Badge>{t("system")}</Badge>}
          </h2>
          {role.description && (
            <span className="text-[13px] text-fg-muted">{role.description}</span>
          )}
        </div>
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {t("deleteRole")}
          </Button>
        )}
      </div>
      {role.is_system && (
        <p className="text-[13px] text-fg-muted">
          {canManage ? t("systemHint") : t("systemHintReadOnly")}
        </p>
      )}
      {permissions.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : permissions.isError && !permissions.data ? (
        <QueryError retry={() => permissions.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(permissions.data?.groups ?? []).map((group) => {
            const grantedInGroup = group.permissions.filter((p) => granted.has(p.code)).length;
            return (
              <fieldset
                key={group.name}
                className="flex min-w-0 flex-col rounded-xs border border-border p-3 pt-1"
              >
                <legend className="flex items-center gap-2 px-1 text-[13px] font-medium text-fg">
                  {t.has(`groups.${group.name}`) ? t(`groups.${group.name}`) : group.name}
                  <span className="text-[12px] font-normal text-fg-muted">
                    {t("permissionCount", {
                      granted: grantedInGroup,
                      total: group.permissions.length,
                    })}
                  </span>
                </legend>
                {group.permissions.map((p) => {
                  const dutyOnly = role.slug === "teacher" && DUTY_ONLY_PERMISSIONS.has(p.code);
                  const text = permissionText(p.code, p.description);
                  const disabled = !editable || dutyOnly;
                  return (
                    // The whole row is the label, so a thumb anywhere on
                    // it toggles the permission, not only the 16px box.
                    <label
                      key={p.code}
                      htmlFor={`perm-${p.code}`}
                      className={cn(
                        "-mx-1 flex items-start gap-3 rounded-xs px-1 py-2 text-[13px]",
                        !disabled && "cursor-pointer hover:bg-bg",
                      )}
                    >
                      <Checkbox
                        id={`perm-${p.code}`}
                        className="mt-0.5"
                        checked={granted.has(p.code)}
                        disabled={disabled}
                        onCheckedChange={(v) => {
                          const next = new Set(granted);
                          if (v === true) next.add(p.code);
                          else next.delete(p.code);
                          onDraftChange([...next]);
                        }}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium text-fg">{text.label}</span>
                        <span className="text-[12px] text-fg-muted">{text.description}</span>
                        <span className="break-all font-mono text-[11px] text-fg-muted">
                          {p.code}
                        </span>
                        {dutyOnly && (
                          <span className="text-[12px] text-fg-muted">{t("dutyOnlyHint")}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
        </div>
      )}
      {editable && dirty && (
        // Sticky so a long matrix never hides the save button: on a phone
        // it rides just above the tab bar.
        <div className="sticky bottom-[calc(var(--shell-mobile-tab-offset)+0.5rem)] z-10 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-surface p-3 shadow-(--shadow-float) md:bottom-4">
          <span className="text-[13px] text-fg">{t("unsaved")}</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onDraftChange(undefined);
              }}
            >
              {t("cancel")}
            </Button>
            <Button size="sm" loading={replace.isPending} onClick={save}>
              {t("save")}
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteRole")}
        description={t("deleteBody", { name: role.name })}
        confirmLabel={t("deleteRole")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(role.id);
            toast.success(t("deleted"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setConfirmDelete(false);
          }
        }}
      />
    </section>
  );
}
