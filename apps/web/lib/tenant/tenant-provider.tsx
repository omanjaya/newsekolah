"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useTenantBranding } from "@newsekolah/api-client/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactElement, ReactNode } from "react";

import { useApiClient } from "../api/client";
import { setDocumentSchoolName } from "../page-title";

import { resolveTenantAccents } from "./accent";
import { readBrandingSessionCopy, writeBrandingSessionCopy } from "./branding-session-copy";
import { PRODUCT_NAME_FALLBACK } from "./product-name";

export type TenantBranding = components["schemas"]["TenantBranding"];
type Me = components["schemas"]["Me"];

export { PRODUCT_NAME_FALLBACK };

interface TenantContextValue {
  /**
   * The last branding known for this school: from the server, the API, this
   * tab's copy, or, while the endpoint fails with none of those, the
   * signed-in session's school.
   */
  branding: TenantBranding | undefined;
  /**
   * True while no branding is known at all: on the first load, and while
   * the endpoint keeps failing with nothing known and nobody signed in. Brand surfaces show a skeleton then, never the product name.
   */
  isLoading: boolean;
  /**
   * `branding.name`; the fallback product name while no branding is known.
   */
  displayName: string;
  /**
   * `branding.short_name` when the school set one: the name for tight
   * places (the phone header, the installed app's label). Unset otherwise,
   * so callers fall back to `displayName`.
   */
  shortName?: string;
}

const TenantContext = createContext<TenantContextValue | null>(null);

function subscribeToNothing(): () => void {
  return unsubscribe;
}

function unsubscribe(): void {
  // The copy only changes through this provider, which re-renders anyway.
}

function noCopyOnServer(): undefined {
  return undefined;
}

/**
 * The school `/v1/me` carries, a full branding, read from the query cache
 * without fetching: this provider sits above the session, which owns that
 * query. Returns the cached object itself, so the snapshot stays stable.
 */
function useSignedInSchool(): TenantBranding | undefined {
  const queryClient = useQueryClient();
  return useSyncExternalStore(
    (onChange) => queryClient.getQueryCache().subscribe(onChange),
    () => queryClient.getQueryData<Me>(queryKeys.me())?.tenant,
    noCopyOnServer,
  );
}

/**
 * The branding endpoint is public and rate limited (429 under load). A
 * refusal is worth retrying, with backoff, unlike most 4xx answers the app
 * gives up on at once (lib/query/query-provider.tsx).
 */
export const BRANDING_MAX_RETRIES = 5;

export function brandingRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/**
 * Fetches `/v1/tenant/branding` (public, no auth needed) once per session
 * and keeps the tenant's accent in sync, per DESIGN.md ("Satu warna aksen
 * per sekolah ... disuntik runtime"). Runs regardless of auth state so the
 * login screen is already branded.
 *
 * Theme-specific accents keep links readable against their surfaces; their
 * paired foregrounds keep filled buttons readable against the accent, and
 * their strong shades give those buttons a hover and press in the school's
 * own colour rather than the platform green. A
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
    const key = queryKeys.tenantBranding();
    queryClient.setQueryDefaults(key, {
      retry: (failureCount) => failureCount < BRANDING_MAX_RETRIES,
      retryDelay: brandingRetryDelay,
      ...(initialBranding ? { staleTime: Infinity } : {}),
    });
    if (initialBranding && queryClient.getQueryData(key) === undefined) {
      queryClient.setQueryData(key, initialBranding);
    }
    return null;
  });
  const { data, failureCount } = useTenantBranding(client);
  // The server's branding seeds the query, and the query keeps its last
  // data through a failed refetch. When neither ever had it (the endpoint
  // refused both the server and this tab), this tab's copy from an earlier
  // page still names the school. Read after hydration only: the server
  // cannot see it, and the first client render must match the server's.
  const sessionCopy = useSyncExternalStore(
    subscribeToNothing,
    readBrandingSessionCopy,
    noCopyOnServer,
  );
  // With nothing known and the endpoint refusing, a signed-in tab still
  // knows its school from the session, whose tenant is the same branding:
  // the header shows its name and logo, the accent follows, and modules the
  // school switched off stay off, instead of a skeleton held for good. Not
  // before the first failure: on a normal load the branding lands moments
  // later.
  const signedInSchool = useSignedInSchool();
  const branding = data ?? sessionCopy ?? (failureCount > 0 ? signedInSchool : undefined);
  const schoolName = branding?.name;
  const isLoading = branding === undefined;

  useEffect(() => {
    if (data) writeBrandingSessionCopy(data);
  }, [data]);

  useEffect(() => {
    const accents = resolveTenantAccents(branding?.accent_color);
    const root = document.documentElement;
    root.style.setProperty("--tenant-accent", accents.light);
    root.style.setProperty("--tenant-accent-dark", accents.dark);
    root.style.setProperty("--tenant-accent-fg", accents.lightFg);
    root.style.setProperty("--tenant-accent-dark-fg", accents.darkFg);
    root.style.setProperty("--tenant-accent-strong", accents.lightStrong);
    root.style.setProperty("--tenant-accent-dark-strong", accents.darkStrong);
    return () => {
      for (const name of [
        "--tenant-accent",
        "--tenant-accent-dark",
        "--tenant-accent-fg",
        "--tenant-accent-dark-fg",
        "--tenant-accent-strong",
        "--tenant-accent-dark-strong",
      ]) {
        root.style.removeProperty(name);
      }
    };
  }, [branding?.accent_color]);

  // The school half of the tab title; the page template adds the page's
  // name in front ("Pengguna · SMA Contoh", lib/page-title.ts). Unknown
  // branding leaves the server's title as it is rather than writing the
  // product name over it.
  useEffect(() => {
    if (schoolName) setDocumentSchoolName(schoolName);
  }, [schoolName]);

  const displayName = schoolName ?? PRODUCT_NAME_FALLBACK;
  // A blank short name counts as none.
  const trimmedShortName = branding?.short_name?.trim();
  const shortName = trimmedShortName === "" ? undefined : trimmedShortName;
  // Same rationale as SessionProvider: an inline value object here would
  // re-render every consumer on each branding refetch, even when nothing
  // about the branding actually changed (docs/16-audit-performa-web.md item 3).
  const value = useMemo<TenantContextValue>(
    () => ({ branding, isLoading, displayName, shortName }),
    [branding, isLoading, displayName, shortName],
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
