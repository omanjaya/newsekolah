"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { ForgotPasswordForm } from "../../../features/auth/components/forgot-password-form";
import { useSession } from "../../../lib/session/session-provider";

export default function ForgotPasswordPage(): ReactElement {
  const { status, isReady } = useSession();
  const router = useRouter();
  const t = useTranslations("app.account.forgotPassword");

  useEffect(() => {
    if (isReady && status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [isReady, status, router]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-[20px] font-medium text-fg">{t("title")}</h1>
      <ForgotPasswordForm />
    </div>
  );
}
