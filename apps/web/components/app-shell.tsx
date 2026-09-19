"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { navigation, filterNavigation } from "../lib/navigation";
import { permissionForPath } from "../lib/navigation-permissions";
import { useSession } from "../lib/session/session-provider";

import { ForbiddenPage } from "./forbidden-page";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { MobileTabBar } from "./mobile-tab-bar";
import { OfflineIndicator } from "./offline-indicator";
import { Sidebar } from "./sidebar";
import { UpdateAvailable } from "./update-available";

// Deferred to a client-only chunk (docs/16-audit-performa-web.md item 8):
// cmdk and the navigation-filtering it does on every `/v1/me` change are not
// needed for first paint, so every `(app)` route stops shipping them in its
// initial JS.
const CommandPaletteProvider = dynamic(
  () => import("./command-palette-provider").then((mod) => mod.CommandPaletteProvider),
  { ssr: false },
);

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
          <main
            id="main-content"
            className="flex-1 pb-[calc(var(--shell-mobile-tab-offset)+1rem)] md:pb-0"
          >
            {allowed ? children : <ForbiddenPage />}
          </main>
        </div>
      </div>
      <MobileTabBar
        items={items}
        profile={me?.profile_kind}
        scope={me ? `${me.tenant.tenant_id}:${me.id}` : undefined}
        className="md:hidden"
      />
      <UpdateAvailable />
    </CommandPaletteProvider>
  );
}
