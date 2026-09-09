"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { ChangePasswordForm } from "../../../features/auth/components/change-password-form";
import { useSession } from "../../../lib/session/session-provider";

/** Only reachable while `must_change_password` is true; see the build brief's forced-change requirement. */
export default function ChangePasswordPage(): ReactElement | null {
  const { status, me, isReady } = useSession();
  const router = useRouter();
  const t = useTranslations("app.changePassword");

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

  if (!isReady || status !== "authenticated" || !me?.must_change_password) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-[20px] font-medium text-fg">{t("forcedTitle")}</h1>
        <p className="mt-1 text-[13px] text-fg-muted">{t("forcedBody")}</p>
      </div>
      <ChangePasswordForm onSuccess={handleSuccess} />
    </div>
  );
}
