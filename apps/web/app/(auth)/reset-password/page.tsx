"use client";

import { Button, SkeletonForm, useToast } from "@newsekolah/ui";
import { Link2Off } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { Suspense, useState } from "react";

import { AuthCard } from "../../../features/auth/components/auth-card";
import { BackToLoginLink } from "../../../features/auth/components/back-to-login-link";
import { ResetPasswordForm } from "../../../features/auth/components/reset-password-form";

/**
 * Serves both the self-service "forgot password" link and an admin-issued
 * set-password link (see users-view.tsx's reset link), which is why the
 * token is read from the URL rather than tied to one specific flow.
 */
function ResetPasswordContent(): ReactElement {
  const t = useTranslations("app.account.resetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const token = searchParams.get("token");
  // Set when the server rejects the token on submit (expired or already used).
  const [rejected, setRejected] = useState(false);

  if (!token || rejected) {
    return (
      <AuthCard
        status={{ tone: "warning", icon: <Link2Off /> }}
        title={t("invalidTitle")}
        documentTitle={t("title")}
        description={t("invalidBody")}
        footer={<BackToLoginLink />}
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">{t("requestNew")}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("title")} description={t("body")} footer={<BackToLoginLink />}>
      <ResetPasswordForm
        token={token}
        onInvalidToken={() => {
          setRejected(true);
        }}
        onSuccess={() => {
          toast.success(t("success"));
          router.replace("/login");
        }}
      />
    </AuthCard>
  );
}

export default function ResetPasswordPage(): ReactElement {
  return (
    // ResetPasswordContent reads the `token` query param via useSearchParams, which needs a Suspense boundary.
    <Suspense fallback={<SkeletonForm fields={2} />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
