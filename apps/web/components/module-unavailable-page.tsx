"use client";

import { Button, EmptyState } from "@newsekolah/ui";
import { PowerOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * Rendered in place of a page whose feature module the school has switched
 * off. Distinct from `ForbiddenPage`: the reader's permissions are fine, the
 * feature simply is not part of their school's plan.
 */
export function ModuleUnavailablePage(): ReactElement {
  const t = useTranslations("app.moduleUnavailable");

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <EmptyState
        icon={<PowerOff aria-hidden="true" />}
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
