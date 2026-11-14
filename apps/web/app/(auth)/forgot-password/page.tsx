"use client";

import { Button } from "@newsekolah/ui";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { AuthCard } from "../../../features/auth/components/auth-card";
import { BackToLoginLink } from "../../../features/auth/components/back-to-login-link";
import { ForgotPasswordForm } from "../../../features/auth/components/forgot-password-form";
import { useSession } from "../../../lib/session/session-provider";

export default function ForgotPasswordPage(): ReactElement {
  const { status, isReady } = useSession();
  const router = useRouter();
  const t = useTranslations("app.account.forgotPassword");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (isReady && status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [isReady, status, router]);

  if (sent) {
    return (
      <AuthCard
        status={{ tone: "success", icon: <MailCheck /> }}
        title={t("successTitle")}
        description={t("successBody")}
      >
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/login">{t("backToLogin")}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("title")} description={t("body")} footer={<BackToLoginLink />}>
      <ForgotPasswordForm
        onSent={() => {
          setSent(true);
        }}
      />
    </AuthCard>
  );
}
