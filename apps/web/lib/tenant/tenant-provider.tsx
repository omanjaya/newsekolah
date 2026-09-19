"use client";

import type { components } from "@newsekolah/api-client";
import { useTenantBranding } from "@newsekolah/api-client/react";
import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { useApiClient } from "../api/client";

import { darkVariantOf, foregroundFor, lightVariantOf, parseHex } from "./accent";

export type TenantBranding = components["schemas"]["TenantBranding"];

export const PRODUCT_NAME_FALLBACK = "SION";

interface TenantContextValue {
  branding: TenantBranding | undefined;
  isLoading: boolean;
  /** `branding.name`, or the fallback product name while branding is unknown. */
  displayName: string;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Fetches `/v1/tenant/branding` (public, no auth needed) once per session
 * and keeps the tenant's accent in sync, per DESIGN.md ("Satu warna aksen
 * per sekolah ... disuntik runtime"). Runs regardless of auth state so the
 * login screen is already branded.
 *
 * Theme-specific accents keep links readable against their surfaces; their
 * paired foregrounds keep filled buttons readable against the accent. The
 * runtime values feed globals.css so switching themes stays CSS-driven.
 */
export function TenantProvider({ children }: { children: ReactNode }): ReactElement {
  const client = useApiClient();
  const { data, isLoading } = useTenantBranding(client);
  const branding = data;

  useEffect(() => {
    const supplied = branding?.accent_color ?? "#1F3A5F";
    const accent = parseHex(supplied) ? supplied : "#1F3A5F";
    const light = lightVariantOf(accent);
    const dark = darkVariantOf(accent);
    const root = document.documentElement;
    root.style.setProperty("--tenant-accent", light);
    root.style.setProperty("--tenant-accent-dark", dark);
    root.style.setProperty("--tenant-accent-fg", foregroundFor(light));
    root.style.setProperty("--tenant-accent-dark-fg", foregroundFor(dark));
    return () => {
      for (const name of [
        "--tenant-accent",
        "--tenant-accent-dark",
        "--tenant-accent-fg",
        "--tenant-accent-dark-fg",
      ]) {
        root.style.removeProperty(name);
      }
    };
  }, [branding?.accent_color]);

  useEffect(() => {
    document.title = branding?.name ?? PRODUCT_NAME_FALLBACK;
  }, [branding?.name]);

  const displayName = branding?.name ?? PRODUCT_NAME_FALLBACK;
  // Same rationale as SessionProvider: an inline value object here would
  // re-render every consumer on each branding refetch, even when nothing
  // about the branding actually changed (docs/16-audit-performa-web.md item 3).
  const value = useMemo<TenantContextValue>(
    () => ({ branding, isLoading, displayName }),
    [branding, isLoading, displayName],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
}
