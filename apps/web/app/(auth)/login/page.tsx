"use client";

import { Skeleton } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { Suspense, useEffect } from "react";

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-medium text-fg">{t("title")}</h1>
        <p className="text-[13px] text-fg-muted">{t("subtitle")}</p>
      </div>
      {/* LoginForm reads the `next` query param via useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
