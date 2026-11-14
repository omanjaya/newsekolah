"use client";

import { TextLink } from "@newsekolah/ui";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** The way back from a password page to the sign-in form, in an AuthCard footer. */
export function BackToLoginLink(): ReactElement {
  const t = useTranslations("app.account.forgotPassword");
  return (
    <TextLink href="/login" className="inline-flex items-center gap-1.5">
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {t("backToLogin")}
    </TextLink>
  );
}
