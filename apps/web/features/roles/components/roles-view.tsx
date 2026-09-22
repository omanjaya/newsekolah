"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Input,
  PageHeader,
  Skeleton,
  cn,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type AdminRole,
  useCreateRoleMutation,
  useDeleteRoleMutation,
  usePermissionsQuery,
  useReplaceRolePermissionsMutation,
  useRolesQuery,
} from "../api";

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
  const list = roles.data?.data ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

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
                {r.user_count !== undefined && (
                  <span className="text-[12px] text-fg-muted">{r.user_count}</span>
                )}
              </button>
            ))}
          </nav>
          {selected && <RoleMatrix key={selected.id} role={selected} canManage={canManage} />}
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

function RoleMatrix({ role, canManage }: { role: AdminRole; canManage: boolean }): ReactElement {
  const t = useTranslations("app.roles");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const permissions = usePermissionsQuery();
  const replace = useReplaceRolePermissionsMutation();
  const remove = useDeleteRoleMutation();
  const [granted, setGranted] = useState<Set<string>>(() => new Set(role.permissions));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = useMemo(() => {
    const original = new Set(role.permissions);
    if (original.size !== granted.size) return true;
    for (const code of granted) if (!original.has(code)) return true;
    return false;
  }, [role.permissions, granted]);
  const editable = canManage && !role.is_system;

  function save() {
    replace.mutate(
      { id: role.id, permissions: [...granted] },
      {
        onSuccess: () => {
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
          <span className="text-[13px] text-fg-muted">{role.description ?? role.slug}</span>
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
      {role.is_system && <p className="text-[13px] text-fg-muted">{t("systemHint")}</p>}
      {permissions.isLoading ? (
        <Skeleton className="h-64 w-full" />
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
                          setGranted((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(p.code);
                            else next.delete(p.code);
                            return next;
                          });
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
                setGranted(new Set(role.permissions));
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

function CreateRoleForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.roles");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateRoleMutation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !slug.trim()) {
          setError(t("requiredError"));
          return;
        }
        create.mutate(
          {
            name: name.trim(),
            slug: slug.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
          },
          {
            onSuccess: () => {
              toast.success(t("created"));
              onDone();
            },
            onError: (err) => {
              setError(
                err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
          }}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("slug")}</span>
        <Input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
          }}
          pattern="[a-z0-9_]+"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("description")}</span>
        <Input
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
