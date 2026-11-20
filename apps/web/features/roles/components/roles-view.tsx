"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  List,
  ListRow,
  SkeletonList,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import { useCan } from "../../../lib/session/session-provider";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import { SettingsSaveBar } from "../../settings/components/settings-save-bar";
import {
  type AdminRole,
  useDeleteRoleMutation,
  useReplaceRolePermissionsMutation,
  useRolesQuery,
} from "../api";

import { CreateRoleForm } from "./create-role-form";
import { RolePermissionsPanel } from "./role-permissions-panel";

/** Codes in one set and not the other: what an unsaved edit changes. */
function difference(a: readonly string[], b: readonly string[]): Set<string> {
  const left = new Set(a);
  const right = new Set(b);
  const out = new Set<string>();
  for (const code of left) if (!right.has(code)) out.add(code);
  for (const code of right) if (!left.has(code)) out.add(code);
  return out;
}

/**
 * Roles and access: the roles on the left (a picker in the panel's header
 * on a phone), the selected role's permissions on the right. Unsaved
 * changes are kept per role, marked on the role, its groups and its rows,
 * and saved from one bar at the bottom edge; leaving the page with any
 * role still changed asks first. Shares Data Sekolah's users area tabs,
 * the area the sidebar highlights for this route.
 */
export function RolesView(): ReactElement {
  const t = useTranslations("app.roles");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_permissions");
  const roles = useRolesQuery();
  const replace = useReplaceRolePermissionsMutation();
  const remove = useDeleteRoleMutation();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Unsaved checkbox edits are kept per role, so switching roles never
  // silently throws a half-finished edit away.
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  // Permissions just saved but not yet reflected by the refetched roles
  // list. Without this the boxes would snap back to the old set until the
  // refetch lands, and a toggle in that window would build on the stale
  // set. Only trusted while the list still holds the array it held at save time.
  const [saved, setSaved] = useState<Record<string, { permissions: string[]; stale: string[] }>>(
    {},
  );
  const list = useMemo(() => roles.data?.data ?? [], [roles.data]);
  const selected = list.find((role) => role.id === selectedId) ?? list[0];

  const baseOf = (role: AdminRole): string[] => {
    const entry = saved[role.id];
    if (!entry) return role.permissions;
    return entry.stale === role.permissions ? entry.permissions : role.permissions;
  };
  const draftIds = useMemo(
    () => new Set(Object.keys(drafts).filter((id) => list.some((role) => role.id === id))),
    [drafts, list],
  );
  useUnsavedChangesProtection(draftIds.size > 0, t("leaveConfirm"));

  const savedEntry = selected ? saved[selected.id] : undefined;
  const selectedBase = useMemo(() => {
    if (!selected) return [];
    return savedEntry?.stale === selected.permissions
      ? savedEntry.permissions
      : selected.permissions;
  }, [selected, savedEntry]);
  const selectedDraft = selected ? drafts[selected.id] : undefined;
  const granted = useMemo(
    () => new Set(selectedDraft ?? selectedBase),
    [selectedDraft, selectedBase],
  );
  const changed = useMemo(
    () => (selectedDraft ? difference(selectedDraft, selectedBase) : new Set<string>()),
    [selectedDraft, selectedBase],
  );

  function setDraft(role: AdminRole, permissions: string[] | undefined) {
    setDrafts((current) => {
      const { [role.id]: _discarded, ...rest } = current;
      // Toggling back to the saved set is no change at all.
      if (!permissions || difference(permissions, baseOf(role)).size === 0) return rest;
      return { ...rest, [role.id]: permissions };
    });
  }

  function save() {
    if (!selected || !selectedDraft) return;
    const role = selected;
    const permissions = [...selectedDraft];
    replace.mutate(
      { id: role.id, permissions },
      {
        onSuccess: () => {
          setSaved((current) => ({
            ...current,
            [role.id]: { permissions, stale: role.permissions },
          }));
          setDraft(role, undefined);
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

  return (
    <AppPage
      nav={<AcademicWorkspaceLinks area="users" />}
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("addRole")}
          </Button>
        ) : undefined
      }
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("addRole"),
              onSelect: () => {
                setCreating(true);
              },
            }
          : undefined
      }
      floating={
        selected && (
          <SettingsSaveBar
            container="default"
            protect={false}
            dirty={changed.size > 0}
            saving={replace.isPending}
            message={t("unsavedRole", { count: changed.size, name: selected.name })}
            saveLabel={t("save")}
            onSave={save}
            onDiscard={() => {
              setDraft(selected, undefined);
            }}
          />
        )
      }
    >
      {roles.isLoading ? (
        <SkeletonList rows={6} framed />
      ) : roles.isError && !roles.data ? (
        <QueryError retry={() => roles.refetch()} error={roles.error} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <Card className="hidden md:sticky md:top-[calc(var(--shell-header-height,3.5rem)+1.5rem)] md:block">
            <CardHeader>
              <CardTitle as="h2">{t("rolesTitle")}</CardTitle>
            </CardHeader>
            <List aria-label={t("rolesTitle")}>
              {list.map((role) => (
                <ListRow
                  key={role.id}
                  title={role.name}
                  selected={role.id === selected?.id}
                  chevron={false}
                  meta={
                    role.user_count !== undefined
                      ? t("roleMetaUsers", {
                          kind: role.is_system ? t("system") : t("custom"),
                          count: role.user_count,
                        })
                      : role.is_system
                        ? t("system")
                        : t("custom")
                  }
                  trailing={
                    draftIds.has(role.id) ? (
                      <Badge tone="warning" size="sm" dot>
                        {t("changed")}
                      </Badge>
                    ) : undefined
                  }
                  onClick={() => {
                    setSelectedId(role.id);
                  }}
                />
              ))}
            </List>
          </Card>
          {selected && (
            <RolePermissionsPanel
              role={selected}
              roles={list}
              onSelectRole={setSelectedId}
              draftRoleIds={draftIds}
              granted={granted}
              changed={changed}
              canManage={canManage}
              onChange={(permissions) => {
                setDraft(selected, permissions);
              }}
              onDelete={() => {
                setConfirmDelete(true);
              }}
            />
          )}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("addRole")} size="md">
          {creating && (
            <CreateRoleForm
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {selected && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("deleteRole")}
          description={t("deleteBody", { name: selected.name })}
          confirmLabel={t("deleteRole")}
          tone="danger"
          confirming={remove.isPending}
          onConfirm={async () => {
            const role = selected;
            try {
              await remove.mutateAsync(role.id);
              setDraft(role, undefined);
              toast.success(t("deleted"));
            } catch (error) {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            } finally {
              setConfirmDelete(false);
            }
          }}
        />
      )}
    </AppPage>
  );
}
