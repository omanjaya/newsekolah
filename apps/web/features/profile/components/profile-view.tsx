"use client";

import { Avatar, Badge, PageHeader } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { ChangePasswordForm } from "../../auth/components/change-password-form";

import { SessionsTable } from "./sessions-table";

export function ProfileView(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.profile");
  const tAuth = useTranslations("auth.sessions");

  if (!me) return null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t("title")} />

      <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4 md:flex-row md:items-center">
        <Avatar name={me.name} src={me.avatar_url} />
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[16px] font-medium text-fg">{me.name}</p>
            <p className="text-[13px] text-fg-muted">@{me.username}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
            <dt className="text-fg-muted">{t("emailLabel")}</dt>
            <dd className="text-fg">{me.email ?? t("emailEmpty")}</dd>
            <dt className="text-fg-muted">{t("rolesLabel")}</dt>
            <dd className="flex flex-wrap gap-1">
              {me.roles.map((role) => (
                <Badge key={role.id} variant={role.is_primary ? "accent" : "neutral"}>
                  {role.name}
                </Badge>
              ))}
            </dd>
          </dl>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-fg">{tAuth("title")}</h2>
        <SessionsTable />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-fg">{t("changePasswordTitle")}</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
