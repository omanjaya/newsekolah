"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, type ReactElement, type ReactNode } from "react";

import { useActionInboxCount } from "../features/inbox/use-action-inbox-count";
import { useNotificationsSocket } from "../features/notifications/realtime";
import { mobileTabLayout, mobileTabRoots } from "../lib/mobile-navigation";
import { navigation, filterNavigation } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";
import { navAccessFromMe } from "../lib/navigation-access";
import { canOpenPath, pathAccess } from "../lib/navigation-permissions";
import { sortQuickActions } from "../lib/navigation-quick-actions";
import { consolidateNavigation } from "../lib/navigation-workspaces";
import { ConnectionStatusIndicator } from "../lib/realtime/connection-status-indicator";
import { LiveSocketProvider } from "../lib/realtime/live-socket-provider";
import { useSession } from "../lib/session/session-provider";
import { useQuickActions } from "../lib/use-quick-actions";

import { CommandPaletteProvider } from "./command-palette-provider";
import { useCurrentSessionHref } from "./current-session-href";
import { ForbiddenPage } from "./forbidden-page";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { MobileTabBar } from "./mobile-tab-bar";
import { ModuleUnavailablePage } from "./module-unavailable-page";
import { OfflineIndicator } from "./offline-indicator";
import { Sidebar } from "./sidebar";
import { SimulationControls } from "./simulation-controls";
import { UpdateAvailable } from "./update-available";
import { useNavDirection } from "./use-nav-direction";
import { useShellHeaderHeight } from "./use-shell-header-height";

/**
 * Single layout for the `(app)` route group (docs/03-layered-architecture.md
 * section 3): sidebar on desktop, a bottom tab bar with a raised centre
 * action on a phone, one header, all reading from the same `navigation`
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
  // The stack's height, strips included, for the `fit` pages under it.
  const shellRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  useShellHeaderHeight(stackRef, shellRef);

  // The phone bar: its tabs and the raised centre action, checked against
  // the same route access as the home hero. A teacher's "Isi presensi"
  // opens the session running now or next, as the hero does.
  const quickActions = sortQuickActions(useQuickActions());
  const layout = mobileTabLayout({
    items,
    profile: me?.profile_kind,
    duties: me?.duties,
    quickActions,
    canOpen: (path) => canOpenPath(path, access),
  });
  const teaching = layout.centre?.id === "attendance";
  const sessionHref = useCurrentSessionHref(me?.tenant.timezone, teaching);
  const tabBar =
    teaching && layout.centre
      ? { ...layout, centre: { ...layout.centre, href: sessionHref } }
      : layout;
  // Which way a phone's page content enters: deeper, back, or across tabs.
  useNavDirection(pathname, mobileTabRoots(layout), (path) => activeNavHref(path, items));

  return (
    <CommandPaletteProvider>
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <div ref={shellRef} className="flex min-h-dvh">
        <Sidebar items={items} className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            One sticky stack: the header, then any standing state as a
            one-line strip (testing as another account, a simulated clock,
            no connection, a new version). Strips stay in view on a long
            page and never sit over the phone's tab bar. Its measured
            height is published as --shell-header-height.
          */}
          <div ref={stackRef} className="sticky top-0 z-sticky">
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
            // What the header and bottom bars cover, for scroll margins (globals.css).
            data-scroll-insets=""
            className="flex-1 pb-[calc(var(--shell-mobile-tab-offset)+1rem)] md:pb-0"
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
        layout={tabBar}
        quickActions={quickActions}
        scope={me ? `${me.tenant.tenant_id}:${me.id}` : undefined}
        className="md:hidden"
      />
    </CommandPaletteProvider>
  );
}
