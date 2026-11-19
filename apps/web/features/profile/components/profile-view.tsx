"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { useSession } from "../../../lib/session/session-provider";
import { ChangePasswordForm } from "../../auth/components/change-password-form";

import { AccountSecurity } from "./account-security";
import { EditDetailForm } from "./edit-detail-form";
import { EditProfileForm } from "./edit-profile-form";
import { ProfileIdentity } from "./profile-identity";
import { SessionsTable } from "./sessions-table";

const TABS = ["account", "personal", "security"] as const;
type ProfileTab = (typeof TABS)[number];

function isTab(value: string | null): value is ProfileTab {
  return value !== null && (TABS as readonly string[]).includes(value);
}

/**
 * The reader's own page: one identity header (photo, name, role, school
 * year), then the account, personal data and security as tabs kept in the
 * URL, on the narrow form template. Each form saves from a bar that rises
 * once something changed.
 */
export function ProfileView(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.profile");
  const tAudit = useTranslations("app.audit");
  const tAuth = useTranslations("auth.sessions");
  const tAccount = useTranslations("app.settingsHub.sections.account");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  if (!me) return null;

  const hasDetail =
    me.profile_kind === "student" || me.profile_kind === "teacher" || me.profile_kind === "staff";
  const requested = search.get("tab");
  const tab: ProfileTab =
    isTab(requested) && (requested !== "personal" || hasDetail) ? requested : "account";

  function selectTab(next: string) {
    const params = new URLSearchParams(search.toString());
    if (next === "account") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    // Opened from the account menu, as Keamanan akun and Preferensi
    // notifikasi are, so it carries their eyebrow ("Akun saya") rather
    // than the registry group ("Pengaturan") no menu shows this reader.
    <AppPage variant="narrow" nav={false} eyebrow={tAccount("title")}>
      <ProfileIdentity />
      <Tabs value={tab} onValueChange={selectTab} className="flex flex-col gap-6">
        <TabsList variant="underline" aria-label={t("tabsLabel")}>
          <TabsTrigger value="account">{t("tabs.account")}</TabsTrigger>
          {hasDetail && <TabsTrigger value="personal">{t("tabs.personal")}</TabsTrigger>}
          <TabsTrigger value="security">{t("tabs.security")}</TabsTrigger>
        </TabsList>

        {/* The form panels stay mounted while hidden, so unsaved edits survive a tab switch.
            Each panel drops TabsContent's own top padding: the Tabs gap spaces it already. */}
        <TabsContent value="account" forceMount className="pt-0 data-[state=inactive]:hidden">
          <EditProfileForm />
        </TabsContent>

        {hasDetail && (
          <TabsContent value="personal" forceMount className="pt-0 data-[state=inactive]:hidden">
            <EditDetailForm />
          </TabsContent>
        )}

        <TabsContent value="security" className="flex flex-col gap-6 pt-0">
          <Card>
            <CardHeader>
              <CardTitle as="h2">{tAudit("accountSecurity.title")}</CardTitle>
            </CardHeader>
            <AccountSecurity />
          </Card>
          <Card padding="md">
            <CardHeader>
              <CardTitle as="h2">{t("changePasswordTitle")}</CardTitle>
              <CardDescription>{t("changePasswordHint")}</CardDescription>
            </CardHeader>
            <ChangePasswordForm />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">{tAuth("title")}</CardTitle>
            </CardHeader>
            <SessionsTable />
          </Card>
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}
