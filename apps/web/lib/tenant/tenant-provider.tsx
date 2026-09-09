"use client";

import type { components } from "@newsekolah/api-client";
import { useTenantBranding } from "@newsekolah/api-client/react";
import { createContext, useContext, useEffect } from "react";
import type { ReactElement, ReactNode } from "react";

import { useApiClient } from "../api/client";

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
 * and keeps `--color-accent` in sync with the tenant's own accent color, per
 * DESIGN.md ("Satu warna aksen per sekolah ... disuntik runtime"). Runs
 * regardless of auth state so the login screen is already branded.
 */
export function TenantProvider({ children }: { children: ReactNode }): ReactElement {
  const client = useApiClient();
  const { data, isLoading } = useTenantBranding(client);
  const branding = data;

  useEffect(() => {
    if (branding?.accent_color) {
      document.documentElement.style.setProperty("--color-accent", branding.accent_color);
    }
  }, [branding?.accent_color]);

  useEffect(() => {
    document.title = branding?.name ?? PRODUCT_NAME_FALLBACK;
  }, [branding?.name]);

  return (
    <TenantContext.Provider
      value={{ branding, isLoading, displayName: branding?.name ?? PRODUCT_NAME_FALLBACK }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
}
