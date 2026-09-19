"use client";

import { DataTableStateProvider } from "@newsekolah/ui";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { useSession } from "../lib/session/session-provider";
import { useTenant } from "../lib/tenant/tenant-provider";
import { ViewStateProvider } from "../lib/view-state/view-state-provider";

/** Isolates in-memory table views whenever the tenant, user, or school year changes. */
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
    <ViewStateProvider key={identityScope}>
      <DataTableStateProvider scope={scope}>{children}</DataTableStateProvider>
    </ViewStateProvider>
  );
}
