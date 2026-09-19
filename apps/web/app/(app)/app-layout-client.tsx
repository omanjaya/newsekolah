"use client";

import type { ReactElement, ReactNode } from "react";

import { AppShell } from "../../components/app-shell";
import { DataTableStateScope } from "../../components/data-table-state-scope";
import { RouteGuard } from "../../components/route-guard";

/**
 * Client half of the `(app)` route group layout (docs/16-audit-performa-web.md
 * item 1). Split out of `layout.tsx` so that file can stay a Server
 * Component and host the `HydrationBoundary` + scoped `NextIntlClientProvider`
 * (item 11) that a client component cannot produce. Everything that was in
 * the old `"use client"` layout — table view state scoping, the session
 * gate, and the shell chrome — lives here unchanged.
 *
 * Table view state and its identity scoping (docs/16-audit-performa-web.md
 * item 8) only matter inside `(app)`: nothing under `(auth)`/`(public)` reads
 * a data table's remembered state, so this stays out of the root providers
 * and out of the JS those routes (e.g. `/login`) ship.
 */
export function AppLayoutClient({ children }: { children: ReactNode }): ReactElement {
  return (
    <DataTableStateScope>
      <RouteGuard>
        <AppShell>{children}</AppShell>
      </RouteGuard>
    </DataTableStateScope>
  );
}
