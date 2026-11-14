"use client";

import { Avatar, Button, Card, SkeletonForm } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { useLogoutMutation } from "../../../features/auth/api";
import { AuthCard } from "../../../features/auth/components/auth-card";
import { ChangePasswordForm } from "../../../features/auth/components/change-password-form";
import { useSession } from "../../../lib/session/session-provider";

/** Only reachable while `must_change_password` is true; see the build brief's forced-change requirement. */
export default function ChangePasswordPage(): ReactElement {
  const { status, me, isReady } = useSession();
  const router = useRouter();
  const t = useTranslations("app.changePassword");
  const tMenu = useTranslations("app.shell.profileMenu");
  const logout = useLogoutMutation();

  useEffect(() => {
    if (!isReady) return;
    if (status === "anonymous") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !me?.must_change_password) {
      router.replace("/dashboard");
    }
  }, [isReady, status, me?.must_change_password, router]);

  function handleSuccess() {
    router.replace("/dashboard");
  }

  async function handleLogout() {
    await logout.mutateAsync();
    router.replace("/login");
  }

  // Waiting for the session, or being redirected away: show the form's
  // shape rather than an empty card.
  if (!isReady || status !== "authenticated" || !me?.must_change_password) {
    return (
      <AuthCard title={t("forcedTitle")} description={t("forcedBody")}>
        <SkeletonForm fields={3} actions={false} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("forcedTitle")}
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
