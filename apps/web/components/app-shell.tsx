"use client";

import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { navigation, filterNavigation } from "../lib/navigation";
import { useSession } from "../lib/session/session-provider";

import { CommandPaletteProvider } from "./command-palette-provider";
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
  const items = filterNavigation(
    navigation,
    (permission) => me?.permissions.includes(permission) ?? false,
    me?.profile_kind,
  );

  return (
    <CommandPaletteProvider>
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <div className="flex min-h-dvh">
        <Sidebar items={items} className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <ImpersonationBanner />
          <OfflineIndicator />
          <main id="main-content" className="flex-1 pb-20 md:pb-0">
            {children}
          </main>
        </div>
      </div>
      <MobileTabBar items={items} className="md:hidden" />
      <UpdateAvailable />
    </CommandPaletteProvider>
  );
}
