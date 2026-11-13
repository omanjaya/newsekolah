"use client";

import { Alert, Button, Skeleton, useToast } from "@newsekolah/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { Suspense, useState } from "react";

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
      <div className="flex flex-col gap-4">
        <h1 className="text-center text-[20px] font-medium text-fg">{t("invalidTitle")}</h1>
        <Alert variant="warning" title={t("invalidBody")} />
        <Button asChild>
          <Link href="/forgot-password">{t("requestNew")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-[20px] font-medium text-fg">{t("title")}</h1>
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
    </div>
  );
}

export default function ResetPasswordPage(): ReactElement {
  return (
    // ResetPasswordContent reads the `token` query param via useSearchParams, which needs a Suspense boundary.
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
