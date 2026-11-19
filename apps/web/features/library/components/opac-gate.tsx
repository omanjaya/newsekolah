"use client";

import { Button, Skeleton, StatePage, cn } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { PUBLIC_CONTAINER } from "../../../components/public-container";
import { isPublicModuleEnabled } from "../../../lib/modules/feature-modules";
import { useDocumentTitle } from "../../../lib/page-title";
import { useTenant } from "../../../lib/tenant/tenant-provider";

/**
 * Wraps the public OPAC pages. An anonymous visitor has no session, so the
 * school's public branding (`disabled_public_modules`) decides: while the
 * school has library switched off the visitor gets the "not available"
 * state, inside the public frame that already names the school, instead of
 * a catalogue whose requests would all be refused. Nothing below mounts,
 * so no OPAC request is made.
 */
export function OpacGate({ children }: { children: ReactNode }): ReactElement {
  const { branding, isLoading } = useTenant();

  if (isLoading) return <OpacGateSkeleton />;
  if (isPublicModuleEnabled(branding, "library")) return <>{children}</>;
  return <OpacUnavailable />;
}

/*
 * The gate's own states name the tab from components of their own: a
 * title hook in the gate itself would also run while the catalogue is
 * shown, and clear the title the catalogue set.
 */

function OpacGateSkeleton(): ReactElement {
  const t = useTranslations("app.library.opac");
  useDocumentTitle(t("title"));
  return (
    <div className={cn(PUBLIC_CONTAINER, "flex flex-col gap-3 py-8 md:py-12")} aria-busy="true">
      <Skeleton className="h-4 w-32 rounded-full" />
      <Skeleton className="h-8 w-64 max-w-full rounded-full" />
      <Skeleton className="mt-5 h-12 w-full rounded-lg" />
    </div>
  );
}

function OpacUnavailable(): ReactElement {
  const t = useTranslations("app.library.opac");
  useDocumentTitle(t("unavailableTitle"));
  return (
    <StatePage
      kind="module-unavailable"
      title={t("unavailableTitle")}
      description={t("unavailableBody")}
      action={
        <Button asChild variant="secondary">
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      }
    />
  );
}
