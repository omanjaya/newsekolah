"use client";

import { Button, EmptyState, Skeleton } from "@newsekolah/ui";
import { PowerOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { TenantBrand } from "../../../components/tenant-brand";
import { isPublicModuleEnabled } from "../../../lib/modules/feature-modules";
import { useTenant } from "../../../lib/tenant/tenant-provider";

/**
 * Wraps the public OPAC pages. An anonymous visitor has no session, so the
 * school's public branding (`disabled_public_modules`) decides: while the
 * school has library switched off the visitor gets a branded "not
 * available" page instead of a catalogue whose requests would all be
 * refused. Nothing below mounts, so no OPAC request is made.
 */
export function OpacGate({ children }: { children: ReactNode }): ReactElement {
  const { branding, isLoading } = useTenant();
  const t = useTranslations("app.library.opac");

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 md:p-6">
        <Skeleton className="h-48 w-full" aria-busy="true" />
      </main>
    );
  }
  if (isPublicModuleEnabled(branding, "library")) return <>{children}</>;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 md:p-6">
      <TenantBrand />
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<PowerOff aria-hidden="true" />}
          title={t("unavailableTitle")}
          description={t("unavailableBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/login">{t("signIn")}</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
