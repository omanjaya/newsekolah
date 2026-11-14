"use client";

import { Button, Skeleton, cn } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { isPublicModuleEnabled } from "../lib/modules/feature-modules";
import { useSession } from "../lib/session/session-provider";
import { useTenant } from "../lib/tenant/tenant-provider";

import { PUBLIC_CONTAINER } from "./public-container";
import { SchoolMark } from "./school-mark";

/**
 * The public pages' header: the school's mark and name, a link to the
 * library catalogue while the school has it on, and the way into the app
 * ("Masuk", or "Ke beranda" for someone already signed in).
 */
export function PublicSiteHeader(): ReactElement {
  const t = useTranslations("app.common.publicSite");
  const { branding, displayName, isLoading } = useTenant();
  const { status, isReady } = useSession();
  const pathname = usePathname();
  const libraryOn = !isLoading && isPublicModuleEnabled(branding, "library");
  const onCatalogue = pathname.startsWith("/opac");
  const signedIn = status === "authenticated";

  return (
    <header className="border-b border-line bg-surface">
      <div className={cn(PUBLIC_CONTAINER, "flex h-16 items-center gap-3")}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SchoolMark size={32} />
          {isLoading ? (
            <Skeleton className="h-4 w-32 rounded-full" />
          ) : (
            <span className="truncate text-heading text-fg">{displayName}</span>
          )}
        </div>
        <nav aria-label={t("navLabel")} className="flex shrink-0 items-center gap-1">
          {libraryOn && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={cn(onCatalogue && "bg-state-selected text-accent")}
            >
              <Link href="/opac" aria-current={onCatalogue ? "page" : undefined}>
                {t("catalogue")}
              </Link>
            </Button>
          )}
          {/* Held invisible until the session is known, so a signed-in
              reader never sees "Masuk" flash before "Ke beranda". */}
          <Button asChild variant="secondary" size="sm" className={cn(!isReady && "invisible")}>
            <Link href={signedIn ? "/dashboard" : "/login"}>
              {signedIn ? t("toDashboard") : t("signIn")}
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
