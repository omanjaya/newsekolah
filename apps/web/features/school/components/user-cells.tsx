"use client";

import { Badge } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AdminUser } from "../api";

/** The primary role as a quiet pill, and how many more the account holds. */
export function UserRolesCell({ user }: { user: AdminUser }): ReactElement | null {
  const t = useTranslations("app.school.users");
  const primary = user.roles.find((role) => role.is_primary) ?? user.roles[0];
  if (!primary) return null;
  const others = user.roles.length - 1;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone="neutral">{primary.name}</Badge>
      {others > 0 && (
        <span className="text-caption text-fg-muted">{t("moreRoles", { n: others })}</span>
      )}
    </span>
  );
}

/**
 * Nearly every account is active, so active stays plain text and only
 * the exceptions stand out: invited in warning, inactive as a neutral pill.
 */
export function UserStatusCell({ user }: { user: AdminUser }): ReactElement {
  const t = useTranslations("app.school.users");
  if (user.status === "active") {
    return <span className="text-fg-muted">{t("status.active")}</span>;
  }
  return (
    <Badge tone={user.status === "invited" ? "warning" : "neutral"} dot>
      {t(`status.${user.status}`)}
    </Badge>
  );
}
