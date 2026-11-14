"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { useActionInboxCount } from "../features/inbox/use-action-inbox-count";
import { useNotificationsSocket } from "../features/notifications/realtime";
import { navigation, filterNavigation } from "../lib/navigation";
import { navAccessFromMe } from "../lib/navigation-access";
import { pathAccess } from "../lib/navigation-permissions";
import { consolidateNavigation } from "../lib/navigation-workspaces";
import { ConnectionStatusIndicator } from "../lib/realtime/connection-status-indicator";
import { LiveSocketProvider } from "../lib/realtime/live-socket-provider";
import { useSession } from "../lib/session/session-provider";

import { CommandPaletteProvider } from "./command-palette-provider";
import { ForbiddenPage } from "./forbidden-page";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { MobileQuickActions } from "./mobile-quick-actions";
import { MobileTabBar } from "./mobile-tab-bar";
import { ModuleUnavailablePage } from "./module-unavailable-page";
import { OfflineIndicator } from "./offline-indicator";
import { Sidebar } from "./sidebar";
import { SimulationControls } from "./simulation-controls";
import { UpdateAvailable } from "./update-available";

/**
 * Single layout for the `(app)` route group (docs/03-layered-architecture.md
 * section 3): sidebar on desktop, bottom tab bar and a floating quick-action
 * button on a phone, one header, all reading from the same `navigation`
 * registry.
 *
 * `LiveSocketProvider` wraps the whole shell so every screen under it can
 * call `useLiveInvalidate`/`useLiveTopic`
 * (docs/analysis/realtime-plan-2026-09-25.md chunk D) against the one
 * multiplexed `/ws/me` connection it owns; `AppShellBody` below is a
 * separate component only so `useNotificationsSocket` (which itself calls
 * `useLiveInvalidate`) runs inside that provider rather than above it.
 */
export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const { me } = useSession();
  return (
    <LiveSocketProvider userId={me?.id}>
      <AppShellBody>{children}</AppShellBody>
    </LiveSocketProvider>
  );
}

function AppShellBody({ children }: { children: ReactNode }): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.shell");
  const pathname = usePathname();
  useNotificationsSocket();
  const access = navAccessFromMe(me);
  const { can } = access;
  const authorizedItems = filterNavigation(navigation, access);
  const inboxCount = useActionInboxCount();
  const consolidated = consolidateNavigation(authorizedItems, {
    profileKind: me?.profile_kind,
    duties: me?.duties,
    canManageSchool: me?.permissions.some((code) =>
      ["manage_master_data", "manage_enrollments", "view_users"].includes(code),
    ),
    can,
  });
  const items = consolidated.map((item) =>
    item.key === "inbox" ? { ...item, badgeCount: inboxCount } : item,
  );

  // A page the reader cannot use would otherwise render its own empty
  // state, because the API refuses each query separately and the screen
  // reads that as "nothing here yet". The permission comes from the
  // navigation registry, where every page already declares it. This sits
  // inside the shell rather than around it, so a refusal still leaves the
  // reader somewhere to go.
  const routeAccess = pathAccess(pathname, access);

  return (
    <CommandPaletteProvider>
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <div className="flex min-h-dvh">
        <Sidebar items={items} className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            One sticky stack: the header, then any standing state as a
            one-line strip (testing as another account, a simulated clock,
            no connection, a new version). Strips stay in view on a long
            page and never sit over the phone's tab bar.
          */}
          <div className="sticky top-0 z-sticky">
            <Header />
            <ImpersonationBanner />
            <SimulationControls />
            <OfflineIndicator />
            <UpdateAvailable />
            {/*
              Renders nothing (ConnectionStatusIndicator returns null)
              except during a sustained realtime disconnect.
            */}
            <div className="flex justify-end px-4 md:px-6">
              <ConnectionStatusIndicator />
            </div>
          </div>
          <main
            id="main-content"
            className="flex-1 pb-[calc(var(--shell-mobile-tab-offset)+var(--shell-fab-space,0px)+1rem)] md:pb-0"
          >
            {routeAccess === "ok" ? (
              children
            ) : routeAccess === "module-disabled" ? (
              <ModuleUnavailablePage />
            ) : (
              <ForbiddenPage />
            )}
          </main>
        </div>
      </div>
      <MobileTabBar
        items={items}
        profile={me?.profile_kind}
        duties={me?.duties}
        scope={me ? `${me.tenant.tenant_id}:${me.id}` : undefined}
        className="md:hidden"
      />
      <MobileQuickActions className="md:hidden" />
    </CommandPaletteProvider>
  );
}
