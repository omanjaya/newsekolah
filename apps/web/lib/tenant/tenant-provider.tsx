"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useTenantBranding } from "@newsekolah/api-client/react";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { useApiClient } from "../api/client";

import { resolveTenantAccents } from "./accent";

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
 * paired foregrounds keep filled buttons readable against the accent. A
 * school without its own colour gets the platform's token pair unchanged
 * (see resolveTenantAccents). The runtime values feed globals.css so
 * switching themes stays CSS-driven.
 */
export function TenantProvider({
  children,
  initialBranding,
}: {
  children: ReactNode;
  /**
   * Branding the server already fetched for this document. Seeds the query
   * cache so a page load makes no browser request to the rate limited public
   * endpoint (60 per minute per IP); it stays fresh for the whole session.
   */
  initialBranding?: TenantBranding;
}): ReactElement {
  const client = useApiClient();
  const queryClient = useQueryClient();
  // Lazy initializer: runs once, before the query below first reads the cache.
  useState(() => {
    if (!initialBranding) return null;
    const key = queryKeys.tenantBranding();
    queryClient.setQueryDefaults(key, { staleTime: Infinity });
    if (queryClient.getQueryData(key) === undefined) {
      queryClient.setQueryData(key, initialBranding);
    }
    return null;
  });
  const { data, isLoading } = useTenantBranding(client);
  const branding = data;

  useEffect(() => {
    const accents = resolveTenantAccents(branding?.accent_color);
    const root = document.documentElement;
    root.style.setProperty("--tenant-accent", accents.light);
    root.style.setProperty("--tenant-accent-dark", accents.dark);
    root.style.setProperty("--tenant-accent-fg", accents.lightFg);
    root.style.setProperty("--tenant-accent-dark-fg", accents.darkFg);
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
