"use client";

import { Skeleton } from "@newsekolah/ui";
import type { ReactElement, ReactNode } from "react";

import { TenantBrand } from "../../../components/tenant-brand";
import { isPublicModuleEnabled } from "../../../lib/modules/feature-modules";
import { useTenant } from "../../../lib/tenant/tenant-provider";

import { OpacUnavailable } from "./opac-unavailable";

/**
 * Wraps the public OPAC pages. An anonymous visitor has no session, so the
 * school's public branding (`disabled_public_modules`) decides: while the
 * school has library switched off the visitor gets a branded "not
 * available" page instead of a catalogue whose requests would all be
 * refused. Nothing below mounts, so no OPAC request is made.
 *
 * When library is switched off after the page loaded, the first refused
 * OPAC request re-reads the branding (lib/query/module-disabled.ts), and
 * this gate then swaps the catalogue for the same page.
 */
export function OpacGate({ children }: { children: ReactNode }): ReactElement {
  const { branding, isLoading } = useTenant();

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
      <OpacUnavailable />
    </main>
  );
}
