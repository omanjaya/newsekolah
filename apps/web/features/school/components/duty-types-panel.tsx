"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Input,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePermissionsQuery } from "../../roles/api";
import { type DutyType } from "../api";
import {
  useDeleteDutyTypeMutation,
  useDutyTypesQuery,
  useReplaceDutyPermissionsMutation,
  useUpdateDutyTypeMutation,
} from "../duties-api";

const SCOPE_KINDS: DutyType["scope_kind"][] = ["school", "class", "student"];

/** Names and permission sets of the duty types themselves (homeroom, counselor, ...), not who holds one. */
export function DutyTypesPanel({ canManage }: { canManage: boolean }): ReactElement {
  const t = useTranslations("app.school.duties");
  const types = useDutyTypesQuery(true);
  const list = types.data?.data ?? [];
  const [selectedId, setSelectedId] = useState("");
  const selected = list.find((d) => d.id === selectedId) ?? list[0];

  if (types.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <nav
        aria-label={t("types.title")}
        className="flex flex-row gap-1 overflow-x-auto md:flex-col"
      >
        {list.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-current={selected?.id === d.id ? "true" : undefined}
            onClick={() => {
              setSelectedId(d.id);
            }}
            className={`flex items-center justify-between rounded-xs px-3 py-2 text-left text-[14px] ${selected?.id === d.id ? "bg-accent/10 text-accent" : "text-fg hover:bg-bg"}`}
          >
            <span>{d.name}</span>
            {!d.is_active && <Badge>{t("types.inactive")}</Badge>}
          </button>
        ))}
      </nav>
      {selected ? (
        <DutyTypeDetail key={selected.id} duty={selected} canManage={canManage} />
      ) : (
        <p className="text-[13px] text-fg-muted">{t("types.empty")}</p>
      )}
    </div>
  );
}

function DutyTypeDetail({ duty, canManage }: { duty: DutyType; canManage: boolean }): ReactElement {
  const t = useTranslations("app.school.duties");
  const tGroups = useTranslations("app.roles");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const permissions = usePermissionsQuery();
  const update = useUpdateDutyTypeMutation();
  const replacePermissions = useReplaceDutyPermissionsMutation();
  const remove = useDeleteDutyTypeMutation();

  const [name, setName] = useState(duty.name);
  const [scopeKind, setScopeKind] = useState<DutyType["scope_kind"]>(duty.scope_kind);
  const [isActive, setIsActive] = useState(duty.is_active);
  const [granted, setGranted] = useState<Set<string>>(() => new Set(duty.permissions));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fieldsDirty =
    name !== duty.name || scopeKind !== duty.scope_kind || isActive !== duty.is_active;
  const permissionsDirty = useMemo(() => {
    const original = new Set(duty.permissions);
    if (original.size !== granted.size) return true;
    for (const code of granted) if (!original.has(code)) return true;
    return false;
  }, [duty.permissions, granted]);

  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  function saveFields() {
    update.mutate(
      { id: duty.id, body: { name: name.trim(), scope_kind: scopeKind, is_active: isActive } },
      {
        onSuccess: () => {
          toast.success(t("types.saved"));
        },
        onError: fail,
      },
    );
  }

  function savePermissions() {
    replacePermissions.mutate(
      { id: duty.id, permissions: [...granted] },
      {
        onSuccess: () => {
          toast.success(t("types.saved"));
        },
        onError: fail,
      },
    );
  }

  return (
    <section className="flex flex-col gap-6 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[18px] font-medium text-fg">{duty.name}</h2>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 />}
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {t("types.delete")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("types.name")}</span>
          <Input
            value={name}
            disabled={!canManage}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("types.scope")}</span>
          <Select
            options={SCOPE_KINDS.map((s) => ({ value: s, label: t(`types.scopeKinds.${s}`) }))}
            value={scopeKind}
            disabled={!canManage}
            onValueChange={(v) => {
              setScopeKind(v as DutyType["scope_kind"]);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={isActive} disabled={!canManage} onCheckedChange={setIsActive} />
          <span className="font-medium">{t("types.active")}</span>
        </label>
      </div>
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" disabled={!fieldsDirty} loading={update.isPending} onClick={saveFields}>
            {t("types.save")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-medium text-fg">{t("types.permissionsTitle")}</h3>
          {canManage && (
            <Button
              size="sm"
              disabled={!permissionsDirty}
              loading={replacePermissions.isPending}
              onClick={savePermissions}
            >
              {t("types.save")}
            </Button>
          )}
        </div>
        <p className="text-[13px] text-fg-muted">{t("types.permissionsBody")}</p>
        {permissions.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(permissions.data?.groups ?? []).map((group) => (
              <fieldset
                key={group.name}
                className="flex flex-col gap-2 rounded-xs border border-border p-3"
              >
                <legend className="px-1 text-[13px] font-medium text-fg">
                  {tGroups.has(`groups.${group.name}`)
                    ? tGroups(`groups.${group.name}`)
                    : group.name}
                </legend>
                {group.permissions.map((p) => (
                  <div key={p.code} className="flex items-start gap-2 text-[13px]">
                    <Checkbox
                      id={`duty-perm-${duty.id}-${p.code}`}
                      aria-label={p.code}
                      checked={granted.has(p.code)}
                      disabled={!canManage}
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
                      <label htmlFor={`duty-perm-${duty.id}-${p.code}`}>{p.code}</label>
                      <span className="text-[12px] text-fg-muted">{p.description}</span>
                    </span>
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("types.delete")}
        description={t("types.deleteBody", { name: duty.name })}
        confirmLabel={t("types.delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(duty.id);
            toast.success(t("types.deleted"));
          } catch (error) {
            fail(error);
          } finally {
            setConfirmDelete(false);
          }
        }}
      />
    </section>
  );
}
