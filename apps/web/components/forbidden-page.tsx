"use client";

import { Button, EmptyState } from "@newsekolah/ui";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** RouteGuard renders this in place (no navigation) when `me` lacks the page's required permission. */
export function ForbiddenPage(): ReactElement {
  const t = useTranslations("app.forbidden");

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <EmptyState
        icon={<ShieldAlert aria-hidden="true" />}
        title={t("title")}
        description={t("body")}
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard">{t("backHome")}</Link>
          </Button>
        }
      />
    </div>
  );
}
