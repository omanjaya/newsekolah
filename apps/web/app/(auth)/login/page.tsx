"use client";

import { SkeletonForm } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { Suspense, useEffect } from "react";

import { AuthCard } from "../../../features/auth/components/auth-card";
import { LoginForm } from "../../../features/auth/components/login-form";
import { useSession } from "../../../lib/session/session-provider";

export default function LoginPage(): ReactElement {
  const { status, me, isReady } = useSession();
  const router = useRouter();
  const t = useTranslations("auth.login");

  useEffect(() => {
    if (!isReady || status !== "authenticated") return;
    router.replace(me?.must_change_password ? "/change-password" : "/dashboard");
  }, [isReady, status, me?.must_change_password, router]);

  return (
    <AuthCard
      title={t("welcomeTitle")}
      documentTitle={t("title")}
      description={t("welcomeBody")}
      footer={t("help")}
    >
      {/* LoginForm reads the `next` query param via useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<SkeletonForm fields={2} actions={false} />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
