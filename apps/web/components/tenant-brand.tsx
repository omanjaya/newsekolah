import { Skeleton } from "@newsekolah/ui";
import type { ReactElement } from "react";

import { initialsFor } from "../lib/tenant/initials";
import { useTenant } from "../lib/tenant/tenant-provider";

/**
 * Logo and name from the current tenant's branding (docs/05-shared-components.md
 * lists this as a shared "TenantBrand" component; it lives here rather than
 * in packages/ui until a second consumer, e.g. apps/mobile, needs it too —
 * see docs/05 section 9's promotion rule). Falls back to a generated
 * initials mark, matching the manifest icon fallback in
 * app/branding-icon/route.ts, so the two never disagree.
 *
 * While branding is still loading, this renders a neutral skeleton at the
 * same footprint instead of the "SION" product-name fallback — otherwise
 * every school briefly flashes the platform name before its own name loads
 * in (docs/analysis/ux-audit-2026-09-25.md, "Login" finding).
 */
export function TenantBrand({
  size = "md",
  mark = false,
}: {
  size?: "sm" | "md";
  /** Logo only, for the collapsed sidebar rail where there is no room for the name. */
  mark?: boolean;
}): ReactElement {
  const { branding, displayName, isLoading } = useTenant();
  const dimension = size === "sm" ? "size-6" : "size-8";

  if (isLoading) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Skeleton className={`${dimension} shrink-0 rounded-sm`} />
        {!mark && <Skeleton className="h-4 w-24" />}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {branding?.logo_url ? (
        // Tenant-supplied external URL: next/image's optimizer would need every
        // school's image host allow-listed, so a plain <img> is the right call here.
        <img
          src={branding.logo_url}
          alt=""
          className={`${dimension} shrink-0 rounded-sm object-contain`}
        />
      ) : (
        <span
          className={`${dimension} shrink-0 rounded-sm text-center text-[11px] font-medium leading-none text-accent-fg`}
          style={{
            backgroundColor: branding?.accent_color ?? "#0F7A5F",
            display: "grid",
            placeItems: "center",
          }}
          aria-hidden="true"
        >
          {initialsFor(displayName)}
        </span>
      )}
      {!mark && <span className="truncate text-[14px] font-medium text-fg">{displayName}</span>}
    </div>
  );
}
