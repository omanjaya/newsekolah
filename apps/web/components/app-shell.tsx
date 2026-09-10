"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { navigation, filterNavigation } from "../lib/navigation";
import { permissionForPath } from "../lib/navigation-permissions";
import { useSession } from "../lib/session/session-provider";

import { CommandPaletteProvider } from "./command-palette-provider";
import { ForbiddenPage } from "./forbidden-page";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { MobileTabBar } from "./mobile-tab-bar";
import { OfflineIndicator } from "./offline-indicator";
import { Sidebar } from "./sidebar";
import { UpdateAvailable } from "./update-available";

/**
 * Single layout for the `(app)` route group (docs/03-layered-architecture.md
 * section 3): sidebar on desktop, bottom tab bar on mobile, one header, all
 * reading from the same `navigation` registry.
 */
export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.shell");
  const pathname = usePathname();
  const items = filterNavigation(
    navigation,
    (permission) => me?.permissions.includes(permission) ?? false,
    me?.profile_kind,
  );

  // A page the reader cannot use would otherwise render its own empty
  // state, because the API refuses each query separately and the screen
  // reads that as "nothing here yet". The permission comes from the
  // navigation registry, where every page already declares it. This sits
  // inside the shell rather than around it, so a refusal still leaves the
  // reader somewhere to go.
  const required = permissionForPath(pathname);
  const allowed = !required || (me?.permissions.includes(required) ?? false);

  return (
    <CommandPaletteProvider>
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <div className="flex min-h-dvh">
        <Sidebar items={items} className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            Sticky like the sidebar: search and the notification bell are
            reached from wherever the reader is on a long page, not only
            from the top of it.
          */}
          <div className="sticky top-0 z-(--z-sticky)">
            <Header />
          </div>
          <ImpersonationBanner />
          <OfflineIndicator />
          <main id="main-content" className="flex-1 pb-20 md:pb-0">
            {allowed ? children : <ForbiddenPage />}
          </main>
        </div>
      </div>
      <MobileTabBar items={items} className="md:hidden" />
      <UpdateAvailable />
    </CommandPaletteProvider>
  );
}
