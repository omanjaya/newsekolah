"use client";

import { EmptyState } from "@newsekolah/ui";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { LinkButton } from "./link-button";

/** RouteGuard renders this in place (no navigation) when `me` lacks the page's required permission. */
export function ForbiddenPage(): ReactElement {
  const t = useTranslations("app.forbidden");

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <EmptyState
        icon={<ShieldAlert aria-hidden="true" />}
        title={t("title")}
        description={t("body")}
        action={<LinkButton href="/dashboard">{t("backHome")}</LinkButton>}
      />
    </div>
  );
}
