import { Skeleton } from "@newsekolah/ui";
import type { ReactElement } from "react";

import { useTenant } from "../lib/tenant/tenant-provider";

import { SchoolMark } from "./school-mark";

/**
 * Logo and name from the current tenant's branding (docs/05-shared-components.md
 * lists this as a shared "TenantBrand" component; it lives here rather than
 * in packages/ui until a second consumer, e.g. apps/mobile, needs it too —
 * see docs/05 section 9's promotion rule). The mark is the shared
 * SchoolMark at 32px, the same one the public header and the sign-in panel
 * draw: the logo, or the school's initials on its own colour, matching the
 * manifest icon in app/branding-icon/route.ts.
 *
 * While branding is unknown, this renders a neutral skeleton at the same
 * footprint instead of the "SION" product-name fallback, so no school ever
 * sees the platform name where its own belongs
 * (docs/analysis/ux-audit-2026-09-25.md, "Login" finding).
 */
export function TenantBrand({
  mark = false,
}: {
  /** Logo only, for the collapsed sidebar rail where there is no room for the name. */
  mark?: boolean;
}): ReactElement {
  const { displayName, isLoading } = useTenant();

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <SchoolMark size={32} />
      {!mark &&
        (isLoading ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <span className="truncate font-heading text-body font-bold tracking-tight text-fg">
            {displayName}
          </span>
        ))}
    </div>
  );
}
