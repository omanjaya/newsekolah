"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  FilterBar,
  FilteredEmptyState,
  SearchInput,
  SegmentedControl,
  Select,
  SkeletonList,
  useMediaQuery,
} from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { type AdminRole, usePermissionsQuery } from "../api";
import { usePermissionText } from "../lib/use-permission-text";

import { PermissionGroup, type PermissionRow } from "./permission-group";

/**
 * identity/domain/errors.go's ErrLeavePermissionDirect: these two codes
 * cannot be granted to the teacher system role directly, only through a
 * duty assignment, so the matrix disables them there instead of letting an
 * admin check a box the server will reject on save.
 */
const DUTY_ONLY_PERMISSIONS = new Set(["review_leave_requests", "issue_leave_letters"]);

type Scope = "all" | "granted";

export interface RolePermissionsPanelProps {
  role: AdminRole;
  /** Every role, for the phone's role picker in the sticky header. */
  roles: AdminRole[];
  onSelectRole: (roleId: string) => void;
  /** Roles with unsaved changes, marked in the phone's role picker. */
  draftRoleIds: ReadonlySet<string>;
  granted: ReadonlySet<string>;
  changed: ReadonlySet<string>;
  canManage: boolean;
  onChange: (granted: string[]) => void;
  onDelete: () => void;
}

/**
 * The permissions of one role, grouped by area: a header that stays in
 * view while the groups scroll (the role, its tally, a search and a
 * granted-only filter; on a phone also the role picker), then one
 * collapsible group per area, sorted by name.
 */
export function RolePermissionsPanel({
  role,
  roles,
  onSelectRole,
  draftRoleIds,
  granted,
  changed,
  canManage,
  onChange,
  onDelete,
}: RolePermissionsPanelProps): ReactElement {
  const t = useTranslations("app.roles");
  const permissions = usePermissionsQuery();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  // Unset means the default: open on a desktop, closed on a phone, where
  // one role should fit in a screen or two of group headers.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const editable = canManage && !role.is_system;

  const text = usePermissionText();
  const groups = useMemo(() => {
    return (permissions.data?.groups ?? [])
      .map((group) => ({
        name: group.name,
        label: t.has(`groups.${group.name}`) ? t(`groups.${group.name}`) : group.name,
        rows: group.permissions.map((permission): PermissionRow => ({
          code: permission.code,
          ...text(permission.code, permission.description),
          dutyOnly: role.slug === "teacher" && DUTY_ONLY_PERMISSIONS.has(permission.code),
        })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [permissions.data, role.slug, t, text]);

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const grantedTotal = groups.reduce(
    (sum, group) => sum + group.rows.filter((row) => granted.has(row.code)).length,
    0,
  );
  const needle = query.trim().toLowerCase();
  const narrowing = needle !== "" || scope === "granted";
  const visible = groups
    .map((group) => ({
      ...group,
      shown: group.rows.filter(
        (row) =>
          (scope === "all" || granted.has(row.code)) &&
          (needle === "" ||
            `${row.label} ${row.description} ${row.code}`.toLowerCase().includes(needle)),
      ),
    }))
    .filter((group) => group.shown.length > 0);

  function setCodes(codes: string[], on: boolean) {
    const next = new Set(granted);
    for (const code of codes) {
      if (on) next.add(code);
      else next.delete(code);
    }
    onChange([...next]);
  }

  const tally = t("roleTally", { granted: grantedTotal, total });
  // By the panel's own width, not the screen's: from 768px the panel sits
  // beside the role list, and a row keyed to 640px of screen left the
  // search a few pixels beside the scope strip in its 176px header there.
  // The two share a row from 24rem of panel (a 12rem search and the strip).
  const filters = (
    <FilterBar
      rowFrom="sm"
      search={
        <SearchInput
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      }
    >
      <SegmentedControl<Scope>
        aria-label={t("scopeLabel")}
        size="sm"
        value={scope}
        onValueChange={setScope}
        className="ml-auto"
        options={[
          { value: "all", label: t("scopeAll") },
          { value: "granted", label: t("scopeGranted") },
        ]}
      />
    </FilterBar>
  );

  return (
    <Card className="min-w-0">
      {/* Stays under the app header while the groups scroll past. */}
      <div className="sticky top-[var(--shell-header-height,3.5rem)] z-sticky flex flex-col gap-3 rounded-t-lg border-b border-line bg-surface px-4 py-3 md:px-5 md:py-4">
        <div className="md:hidden">
          <Select
            aria-label={t("rolePicker")}
            value={role.id}
            onValueChange={onSelectRole}
            options={roles.map((item) => ({
              value: item.id,
              label: draftRoleIds.has(item.id)
                ? t("roleOptionUnsaved", { name: item.name })
                : item.name,
            }))}
          />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <CardTitle as="h2" className="text-title">
                {role.name}
              </CardTitle>
              <Badge tone={role.is_system ? "neutral" : "info"} size="sm">
                {role.is_system ? t("system") : t("custom")}
              </Badge>
            </div>
            <p className="text-body-sm text-fg-muted">
              {tally}
              {role.description ? ` · ${role.description}` : ""}
            </p>
          </div>
          {editable && (
            <Button variant="ghost" icon={<Trash2 />} className="shrink-0" onClick={onDelete}>
              <span className="sr-only sm:not-sr-only">{t("deleteRole")}</span>
            </Button>
          )}
        </div>
        {isDesktop && filters}
      </div>

      <div className="flex flex-col gap-4 pt-4">
        {!isDesktop && <div className="px-4">{filters}</div>}
        {role.is_system && (
          <Alert
            variant="info"
            className="mx-4 md:mx-5"
            title={canManage ? t("systemHint") : t("systemHintReadOnly")}
          />
        )}
        {permissions.isLoading ? (
          <SkeletonList rows={6} framed={false} leading={false} className="px-4 md:px-5" />
        ) : permissions.isError && !permissions.data ? (
          <div className="px-4 pb-4 md:px-5">
            <QueryError retry={() => permissions.refetch()} error={permissions.error} />
          </div>
        ) : visible.length === 0 ? (
          <FilteredEmptyState
            onReset={() => {
              setQuery("");
              setScope("all");
            }}
          />
        ) : (
          <div className="flex flex-col divide-y divide-line pb-2">
            {visible.map((group) => (
              <PermissionGroup
                key={group.name}
                label={group.label}
                rows={group.shown}
                codes={group.rows.map((row) => row.code)}
                granted={granted}
                changed={changed}
                editable={editable}
                expanded={narrowing || (expanded[group.name] ?? isDesktop)}
                onExpandedChange={(open) => {
                  setExpanded((current) => ({ ...current, [group.name]: open }));
                }}
                onToggle={(code, on) => {
                  setCodes([code], on);
                }}
                onToggleAll={setCodes}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
