"use client";

import { Skeleton, cn } from "@newsekolah/ui";
import type { ReactElement } from "react";

import { initialsFor } from "../lib/tenant/initials";
import { useTenant } from "../lib/tenant/tenant-provider";

export type SchoolMarkSize = 32 | 40 | 48 | 64;

const BOX: Record<SchoolMarkSize, string> = {
  32: "size-8 rounded-sm",
  40: "size-10 rounded-md",
  48: "size-12 rounded-md",
  64: "size-16 rounded-lg",
};

/** Initials on the type roles, Manrope throughout so the mark reads as a wordmark. */
const INITIALS: Record<SchoolMarkSize, string> = {
  32: "text-caption font-heading font-bold",
  40: "text-body font-heading font-bold",
  48: "text-heading",
  64: "text-title-lg",
};

export interface SchoolMarkProps {
  size?: SchoolMarkSize;
  /**
   * `page` (default) sits on the page or a card. `brand` sits on the
   * school's accent surface (the sign-in panel), where the logo gets a
   * light plate and the initials a translucent one in the panel's label
   * colour.
   */
  surface?: "page" | "brand";
  className?: string;
}

/**
 * The school's logo, or its initials when it has none, matching the
 * manifest icon (app/branding-icon). Decorative: the school's name is
 * always written next to it. While branding loads it holds its footprint
 * with a skeleton, so the product name never flashes in its place.
 */
export function SchoolMark({
  size = 40,
  surface = "page",
  className,
}: SchoolMarkProps): ReactElement {
  const { branding, displayName, isLoading } = useTenant();
  const onBrand = surface === "brand";

  if (isLoading) {
    return (
      <Skeleton className={cn(BOX[size], "shrink-0", onBrand && "bg-accent-fg/15", className)} />
    );
  }

  if (branding?.logo_url) {
    return (
      // A tenant-supplied external URL: next/image would need every school's
      // image host allow-listed, so a plain img is the right element here.
      <img
        src={branding.logo_url}
        alt=""
        className={cn(
          BOX[size],
          "shrink-0 object-contain",
          onBrand && "bg-accent-fg p-1.5 shadow-1",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        BOX[size],
        INITIALS[size],
        "grid shrink-0 place-items-center leading-none select-none",
        // On the page the mark is the school's own colour in both themes,
        // with the label colour computed for that fill (TenantProvider).
        onBrand
          ? "bg-accent-fg/12 text-accent-fg ring-1 ring-accent-fg/25 ring-inset"
          : "bg-(--tenant-accent) text-(--tenant-accent-fg)",
        className,
      )}
    >
      {initialsFor(displayName)}
    </span>
  );
}
