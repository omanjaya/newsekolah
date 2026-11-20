"use client";

import { Avatar, Button, Card, SkeletonForm } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { useLogoutMutation } from "../../../features/auth/api";
import { AuthCard } from "../../../features/auth/components/auth-card";
import { ChangePasswordForm } from "../../../features/auth/components/change-password-form";
import { needsForcedPasswordChange } from "../../../lib/session/forced-password-change";
import { forgetAccountOnThisBrowser } from "../../../lib/session/forget-account";
import { useSession } from "../../../lib/session/session-provider";

/**
 * Only reachable while the session must change its password (the build
 * brief's forced-change requirement). An impersonation session never must
 * (needsForcedPasswordChange): it goes to the dashboard, where the
 * impersonation strip offers the way back to the administrator's account.
 */
export default function ChangePasswordPage(): ReactElement {
  const { status, me, isReady } = useSession();
  const router = useRouter();
  const t = useTranslations("app.changePassword");
  const tMenu = useTranslations("app.shell.profileMenu");
  // The h1 is a sentence; the tab gets the short name of the step.
  const tAuth = useTranslations("auth.changePassword");
  const logout = useLogoutMutation();
  const mustChangePassword = needsForcedPasswordChange(me);

  useEffect(() => {
    if (!isReady) return;
    if (status === "anonymous") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !mustChangePassword) {
      router.replace("/dashboard");
    }
  }, [isReady, status, mustChangePassword, router]);

  function handleSuccess() {
    router.replace("/dashboard");
  }

  async function handleLogout() {
    // Before the request, so a sign-out that fails on the network still forgets.
    forgetAccountOnThisBrowser();
    await logout.mutateAsync();
    router.replace("/login");
  }

  // Waiting for the session, or being redirected away: show the form's
  // shape rather than an empty card.
  if (!isReady || status !== "authenticated" || !me || !mustChangePassword) {
    return (
      <AuthCard
        title={t("forcedTitle")}
        documentTitle={tAuth("title")}
        description={t("forcedBody")}
      >
        <SkeletonForm fields={3} actions={false} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("forcedTitle")}
      documentTitle={tAuth("title")}
      description={t("forcedBody")}
      footer={
        // The whole app is locked until this step is done, so the only
        // other way out, for someone on the wrong account, is signing out.
        <p>
          {t("notYou")}{" "}
          <Button
            variant="link"
            loading={logout.isPending}
            onClick={() => void handleLogout()}
            className="text-label"
          >
            {tMenu("logout")}
          </Button>
        </p>
      }
    >
      {me.name && (
        <Card tone="sunken">
          <div className="flex items-center gap-3 p-3">
            <Avatar name={me.name} src={me.avatar_url} size={40} decorative />
            <div className="flex min-w-0 flex-col">
              <span className="text-caption text-fg-muted">{t("signedInAs")}</span>
              <span className="truncate text-label text-fg">{me.name}</span>
            </div>
            <span className="ml-auto shrink-0 truncate text-body-sm text-fg-muted">
              {me.username}
            </span>
          </div>
        </Card>
      )}
      <ChangePasswordForm layout="auth" onSuccess={handleSuccess} />
    </AuthCard>
  );
}
