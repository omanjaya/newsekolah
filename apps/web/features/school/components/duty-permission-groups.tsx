"use client";

import { Checkbox, SectionHeader } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { usePermissionText } from "../../roles/lib/use-permission-text";

export interface PermissionGroup {
  name: string;
  permissions: { code: string; description: string }[];
}

const BOX = "flex flex-col gap-2 rounded-md bg-surface-sunken p-3";

/**
 * The permissions a duty type grants, grouped by area. A reader who can
 * manage permissions gets every permission as a checkbox; anyone else
 * reads only what the duty grants, with who can change it, instead of a
 * wall of disabled checkboxes. Each group's title sits inside its box (a
 * `<legend>` straddles the rounded border).
 */
export function DutyPermissionGroups({
  groups,
  granted,
  canManage,
  onToggle,
}: {
  groups: readonly PermissionGroup[];
  granted: ReadonlySet<string>;
  canManage: boolean;
  onToggle: (code: string, on: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.school.duties.types");
  const tRoles = useTranslations("app.roles");
  const permissionText = usePermissionText();
  const groupLabel = (name: string) =>
    tRoles.has(`groups.${name}`) ? tRoles(`groups.${name}`) : name;
  const titleId = (name: string) => `duty-permissions-${name}`;

  if (canManage) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.name} role="group" aria-labelledby={titleId(group.name)} className={BOX}>
            <SectionHeader
              as="h4"
              size="sm"
              title={groupLabel(group.name)}
              titleId={titleId(group.name)}
            />
            {group.permissions.map((p) => (
              <Checkbox
                key={p.code}
                {...permissionText(p.code, p.description)}
                checked={granted.has(p.code)}
                onCheckedChange={(v) => {
                  onToggle(p.code, v === true);
                }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  const grantedGroups = groups
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((p) => granted.has(p.code)),
    }))
    .filter((group) => group.permissions.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-fg-muted">{t("permissionsReadOnly")}</p>
      {grantedGroups.length === 0 ? (
        <p className="text-body-sm text-fg">{t("noPermissions")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {grantedGroups.map((group) => (
            <section key={group.name} aria-labelledby={titleId(group.name)} className={BOX}>
              <SectionHeader
                as="h4"
                size="sm"
                title={groupLabel(group.name)}
                titleId={titleId(group.name)}
              />
              <ul className="flex flex-col gap-2">
                {group.permissions.map((p) => {
                  const text = permissionText(p.code, p.description);
                  return (
                    <li key={p.code} className="flex flex-col gap-0.5">
                      <span className="text-body-sm text-fg">{text.label}</span>
                      {text.description && (
                        <span className="text-caption text-fg-muted">{text.description}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
