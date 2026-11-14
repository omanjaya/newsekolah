"use client";

import { Badge, Card } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";

import { AvatarUpload } from "./avatar-upload";

/**
 * The head of the profile page: the photo (64px, with its change control),
 * the name, the username and email, the reader's roles with the primary
 * one first, and the school year they are working in.
 */
export function ProfileIdentity(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.profile");
  if (!me) return null;
  const roles = [...me.roles].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return (
    <Card padding="md">
      <AvatarUpload>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="min-w-0">
            <p className="truncate text-title text-fg">{me.name}</p>
            <p className="truncate text-body-sm text-fg-muted">
              @{me.username}
              {me.email ? ` · ${me.email}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {roles.map((role) => (
              <Badge key={role.id} tone={role.is_primary ? "accent" : "neutral"} size="sm">
                {role.name}
              </Badge>
            ))}
            <Badge appearance="outline" size="sm">
              {me.active_academic_year
                ? t("academicYear", { year: me.active_academic_year.label })
                : t("noAcademicYear")}
            </Badge>
          </div>
        </div>
      </AvatarUpload>
    </Card>
  );
}
