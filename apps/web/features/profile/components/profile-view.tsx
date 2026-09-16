"use client";

import { Avatar, Badge, PageHeader } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { ChangePasswordForm } from "../../auth/components/change-password-form";

import { AccountSecurity } from "./account-security";
import { AvatarUpload } from "./avatar-upload";
import { EditDetailForm } from "./edit-detail-form";
import { EditProfileForm } from "./edit-profile-form";
import { SessionsTable } from "./sessions-table";

export function ProfileView(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.profile");
  const tAuth = useTranslations("auth.sessions");
  const tAudit = useTranslations("app.audit");

  if (!me) return null;

  const hasDetail =
    me.profile_kind === "student" || me.profile_kind === "teacher" || me.profile_kind === "staff";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t("title")} />

      {/*
        Two columns on a wide screen. These are six short sections; stacked
        in one column they leave most of a monitor empty, and pinned to a
        narrow centred column they stop matching every other page, which
        runs full width.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4 lg:col-span-2 md:flex-row md:items-center">
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

        <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[16px] font-medium text-fg">{t("avatar.title")}</h2>
          <AvatarUpload />
        </section>

        <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[16px] font-medium text-fg">{t("edit.title")}</h2>
          <EditProfileForm />
        </section>

        {hasDetail && (
          <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 lg:col-span-2">
            <h2 className="text-[16px] font-medium text-fg">{t("detail.title")}</h2>
            <EditDetailForm />
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[16px] font-medium text-fg">{tAudit("accountSecurity.title")}</h2>
          <AccountSecurity />
        </section>

        <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[16px] font-medium text-fg">{t("changePasswordTitle")}</h2>
          <ChangePasswordForm />
        </section>

        <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="text-[16px] font-medium text-fg">{tAuth("title")}</h2>
          <SessionsTable />
        </section>
      </div>
    </div>
  );
}
