"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  FormError,
  Input,
  List,
  ListRow,
  Select,
  SkeletonList,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePermissionsQuery } from "../../roles/api";
import { type DutyType } from "../api";
import {
  useCreateDutyTypeMutation,
  useDeleteDutyTypeMutation,
  useDutyTypesQuery,
  useReplaceDutyPermissionsMutation,
  useUpdateDutyTypeMutation,
} from "../duties-api";

import { DutyPermissionGroups } from "./duty-permission-groups";

const SCOPE_KINDS: DutyType["scope_kind"][] = ["school", "class", "student"];

/** Turns a duty name into the `^[a-z0-9_]{2,50}$` slug the API requires. */
function slugifyDutyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

/** Names and permission sets of the duty types themselves (homeroom, counselor, ...), not who holds one. */
export function DutyTypesPanel({ canManage }: { canManage: boolean }): ReactElement {
  const t = useTranslations("app.school.duties");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const types = useDutyTypesQuery(true);
  const create = useCreateDutyTypeMutation();
  const list = types.data?.data ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopeKind, setScopeKind] = useState<DutyType["scope_kind"]>("school");
  const [error, setError] = useState<string | null>(null);
  const selected = list.find((d) => d.id === selectedId) ?? list[0];

  if (types.isLoading) {
    return <SkeletonList rows={5} framed />;
  }

  function resetCreateForm() {
    setName("");
    setScopeKind("school");
    setError(null);
  }

  function submitCreate() {
    const slug = slugifyDutyName(name);
    if (name.trim() === "" || slug.length < 2) {
      setError(t("types.form.nameError"));
      return;
    }
    if (list.some((d) => d.slug === slug)) {
      setError(t("types.form.nameTaken"));
      return;
    }
    create.mutate(
      { name: name.trim(), scope_kind: scopeKind, slug },
      {
        onSuccess: (duty) => {
          toast.success(t("types.saved"));
          setSelectedId(duty.id);
          setCreating(false);
          resetCreateForm();
        },
        onError: (err) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    // md:h-full: fills the tab panel's height; the type list and the
    // detail panel each scroll internally instead of the whole page.
    <div className="grid gap-4 md:h-full md:min-h-0 md:grid-cols-[240px_1fr]">
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={() => {
              resetCreateForm();
              setCreating(true);
            }}
          >
            {t("types.add")}
          </Button>
        )}
        {/* A phone picks the type here; the list below is for a wide screen. */}
        <Select
          className="md:hidden"
          aria-label={t("types.title")}
          options={list.map((d) => ({ value: d.id, label: d.name }))}
          value={selected?.id}
          onValueChange={setSelectedId}
        />
        <Card className="max-md:hidden md:min-h-0 md:overflow-y-auto">
          <nav aria-label={t("types.title")}>
            <List dense variant="plain">
              {list.map((d) => (
                <ListRow
                  key={d.id}
                  title={d.name}
                  selected={selected?.id === d.id}
                  chevron={false}
                  trailing={
                    d.is_active ? undefined : <Badge tone="neutral">{t("types.inactive")}</Badge>
                  }
                  onClick={() => {
                    setSelectedId(d.id);
                  }}
                />
              ))}
            </List>
          </nav>
        </Card>
      </div>
      {selected ? (
        <DutyTypeDetail key={selected.id} duty={selected} canManage={canManage} />
      ) : (
        <EmptyState icon={<ShieldCheck aria-hidden="true" />} title={t("types.empty")} />
      )}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent title={t("types.add")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            {error && <FormError>{error}</FormError>}
            {/* Marked on the label; submitCreate says what is missing, not the browser. */}
            <Field label={t("types.name")} required>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </Field>
            <Field label={t("types.scope")}>
              <Select
                options={SCOPE_KINDS.map((s) => ({ value: s, label: t(`types.scopeKinds.${s}`) }))}
                value={scopeKind}
                onValueChange={(v) => {
                  setScopeKind(v as DutyType["scope_kind"]);
                }}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreating(false);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" loading={create.isPending}>
                {t("types.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DutyTypeDetail({ duty, canManage }: { duty: DutyType; canManage: boolean }): ReactElement {
  const t = useTranslations("app.school.duties");
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
    <Card padding="md" className="gap-6 md:min-h-0 md:overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CardTitle as="h2" className="text-title">
          {duty.name}
        </CardTitle>
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
        <Field label={t("types.name")}>
          <Input
            value={name}
            disabled={!canManage}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </Field>
        <Field label={t("types.scope")}>
          <Select
            options={SCOPE_KINDS.map((s) => ({ value: s, label: t(`types.scopeKinds.${s}`) }))}
            value={scopeKind}
            disabled={!canManage}
            onValueChange={(v) => {
              setScopeKind(v as DutyType["scope_kind"]);
            }}
          />
        </Field>
        <Field label={t("types.active")}>
          <Switch checked={isActive} disabled={!canManage} onCheckedChange={setIsActive} />
        </Field>
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
          <CardTitle as="h3">{t("types.permissionsTitle")}</CardTitle>
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
        <p className="text-body-sm text-fg-muted">{t("types.permissionsBody")}</p>
        {permissions.isLoading ? (
          <SkeletonList rows={4} />
        ) : (
          <DutyPermissionGroups
            groups={permissions.data?.groups ?? []}
            granted={granted}
            canManage={canManage}
            onToggle={(code, on) => {
              setGranted((prev) => {
                const next = new Set(prev);
                if (on) next.add(code);
                else next.delete(code);
                return next;
              });
            }}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("types.delete")}
        description={t("types.deleteBody", { name: duty.name })}
        confirmLabel={t("types.delete")}
        tone="danger"
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
    </Card>
  );
}
