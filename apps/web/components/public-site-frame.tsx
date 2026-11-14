"use client";

import { UiLinkProvider, cn } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { useTenant } from "../lib/tenant/tenant-provider";

import { PUBLIC_CONTAINER } from "./public-container";
import { PublicSiteHeader } from "./public-site-header";

/**
 * The school-branded frame of every page outside the app: the public
 * pages (catalogue, document check, offline) and the root not-found and
 * error pages. Header with the school's identity, the page in the shared
 * public column, and a plain footer.
 */
export function PublicSiteFrame({ children }: { children: ReactNode }): ReactElement {
  const tShell = useTranslations("app.shell");
  const t = useTranslations("app.common.publicSite");
  const { displayName, isLoading } = useTenant();

  return (
    <UiLinkProvider component={Link}>
      <div className="flex min-h-dvh flex-col bg-bg">
        <a href="#public-content" className="skip-link">
          {tShell("skipToContent")}
        </a>
        <PublicSiteHeader />
        <main id="public-content" className="flex flex-1 flex-col">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className={cn(PUBLIC_CONTAINER, "py-6")}>
            {/* No name until branding is known, never the product's. */}
            <p className="min-h-4 text-caption text-fg-muted">
              {isLoading
                ? null
                : // A string, so the year is not grouped as a number ("2.026").
                  t("copyright", { year: String(new Date().getFullYear()), school: displayName })}
            </p>
          </div>
        </footer>
      </div>
    </UiLinkProvider>
  );
}
