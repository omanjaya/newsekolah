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
 */
export function TenantBrand({
  size = "md",
  mark = false,
}: {
  size?: "sm" | "md";
  /** Logo only, for the collapsed sidebar rail where there is no room for the name. */
  mark?: boolean;
}): ReactElement {
  const { branding, displayName } = useTenant();
  const dimension = size === "sm" ? "size-6" : "size-8";

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
            backgroundColor: branding?.accent_color ?? "#1F3A5F",
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
