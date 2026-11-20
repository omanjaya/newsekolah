"use client";

import type { components } from "@newsekolah/api-client";
import { useMe } from "@newsekolah/api-client/react";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { useApiClient } from "../api/client";

import { isAnonymousPublicVisit } from "./access-cookie";

export type Me = components["schemas"]["Me"];

export type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionContextValue {
  status: SessionStatus;
  me: Me | undefined;
  /** True once the boot refresh + `/v1/me` round trip has settled either way. */
  isReady: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * docs/08-security.md: the access token never touches storage, so every
 * fresh page load starts from nothing but the httpOnly refresh cookie.
 * `useMe` fires `GET /v1/me` immediately with whatever access token exists
 * (none, on a fresh load); `@newsekolah/api-client`'s own middleware treats
 * that 401 as "try `/v1/auth/refresh` once, then retry" (see its README),
 * which is exactly the boot-refresh behavior this provider needs — no
 * separate manual refresh call required. After a successful sign-in,
 * `useStartSession` (which `useLogin` uses) empties the query cache but for
 * the tenant's branding (so a previous account's data, or a previous
 * account's cached *error* on some other query, never leaks into the new
 * session -- see `useLogin`'s doc comment) and seeds this same `me` query
 * straight from the sign-in response, so this
 * flips to "authenticated" on its own with no anonymous gap; no extra
 * wiring needed at the call site.
 *
 * The one exception is an anonymous visit to a public page (no refresh
 * cookie on the document request, see `isAnonymousPublicVisit`): there is
 * no session to read, so `/v1/me` is not asked and the page reads as
 * anonymous at once.
 */
export function SessionProvider({
  sessionCookieSeen,
  children,
}: {
  /** Whether the document request carried the refresh cookie (root layout). */
  sessionCookieSeen: boolean;
  children: ReactNode;
}): ReactElement {
  const client = useApiClient();
  const pathname = usePathname();
  // An anonymous visit to a public page has no session to read: asking
  // would only log a 401 (see isAnonymousPublicVisit). It reads as
  // anonymous at once, and a sign-in on the way still seeds `me`.
  const { data, isLoading } = useMe(client, {
    enabled: !isAnonymousPublicVisit(pathname, sessionCookieSeen),
  });

  const status: SessionStatus = isLoading ? "loading" : data ? "authenticated" : "anonymous";
  const isReady = !isLoading;

  // `refetchOnWindowFocus` (default true) refires `/v1/me` on every window
  // focus; an inline object literal here would give `useCan()` callers a new
  // value each time even when `data` is unchanged, cascading re-renders
  // app-wide (docs/16-audit-performa-web.md item 3).
  const value = useMemo<SessionContextValue>(
    () => ({ status, me: data, isReady }),
    [status, data, isReady],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}

/** True once `me.permissions` includes the given code. Always false while loading or anonymous. */
export function useCan(permission: string): boolean {
  const { me } = useSession();
  return me?.permissions.includes(permission) ?? false;
}
