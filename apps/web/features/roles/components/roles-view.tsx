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
                className={`flex items-center justify-between rounded-xs px-3 py-2 text-left text-[14px] ${selected?.id === r.id ? "bg-accent/10 text-accent" : "text-fg hover:bg-bg"}`}
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
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              {t("deleteRole")}
            </Button>
            <Button
              size="sm"
              disabled={!dirty}
              loading={replace.isPending}
              onClick={() => {
                replace.mutate(
                  { id: role.id, permissions: [...granted] },
                  {
                    onSuccess: () => {
                      toast.success(t("saved"));
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  },
                );
              }}
            >
              {t("save")}
            </Button>
          </div>
        )}
      </div>
      {role.is_system && <p className="text-[13px] text-fg-muted">{t("systemHint")}</p>}
      {permissions.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(permissions.data?.groups ?? []).map((group) => (
            <fieldset
              key={group.name}
              className="flex flex-col gap-2 rounded-xs border border-border p-3"
            >
              <legend className="px-1 text-[13px] font-medium text-fg">
                {t.has(`groups.${group.name}`) ? t(`groups.${group.name}`) : group.name}
              </legend>
              {group.permissions.map((p) => (
                <div key={p.code} className="flex items-start gap-2 text-[13px]">
                  <Checkbox
                    id={`perm-${p.code}`}
                    aria-label={p.code}
                    checked={granted.has(p.code)}
                    disabled={!editable}
                    onCheckedChange={(v) => {
                      setGranted((prev) => {
                        const next = new Set(prev);
                        if (v === true) next.add(p.code);
                        else next.delete(p.code);
                        return next;
                      });
                    }}
                  />
                  <span className="flex flex-col">
                    <label htmlFor={`perm-${p.code}`}>{p.code}</label>
                    <span className="text-[12px] text-fg-muted">{p.description}</span>
                  </span>
                </div>
              ))}
            </fieldset>
          ))}
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
