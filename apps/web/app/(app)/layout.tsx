"use client";

import type { ReactElement, ReactNode } from "react";

import { AppShell } from "../../components/app-shell";
import { DataTableStateScope } from "../../components/data-table-state-scope";
import { RouteGuard } from "../../components/route-guard";

/**
 * Table view state and its identity scoping (docs/16-audit-performa-web.md
 * item 8) only matter inside `(app)`: nothing under `(auth)`/`(public)` reads
 * a data table's remembered state, so this stays out of the root providers
 * and out of the JS those routes (e.g. `/login`) ship.
 */
export default function AppLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <DataTableStateScope>
      <RouteGuard>
        <AppShell>{children}</AppShell>
      </RouteGuard>
    </DataTableStateScope>
  );
}
