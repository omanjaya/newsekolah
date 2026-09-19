"use client";

import { DataTableStateProvider } from "@newsekolah/ui";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { useSession } from "../lib/session/session-provider";
import { useTenant } from "../lib/tenant/tenant-provider";
import { ViewStateProvider } from "../lib/view-state/view-state-provider";

/**
 * Isolates in-memory table views whenever the tenant, user, or school year
 * changes. `identityScope` is passed down as data (`ViewStateProvider`'s
 * `identity` prop and `DataTableStateProvider`'s `scope` prefix) rather than
 * a React `key`, so switching tenant/user/year clears remembered state
 * without remounting the whole app tree underneath (that used to happen
 * 2-3 times per cold load as branding and `/v1/me` resolved — see
 * docs/16-audit-performa-web.md item 2).
 */
export function DataTableStateScope({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const { me } = useSession();
  const { branding } = useTenant();
  const identityScope = [
    branding?.tenant_id ?? "pending-tenant",
    me?.id ?? "anonymous",
    me?.active_academic_year?.id ?? "no-year",
  ].join(":");
  const scope = `${identityScope}:${pathname}`;

  return (
    <ViewStateProvider identity={identityScope}>
      <DataTableStateProvider scope={scope}>{children}</DataTableStateProvider>
    </ViewStateProvider>
  );
}
