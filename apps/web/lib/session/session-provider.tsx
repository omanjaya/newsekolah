"use client";

import type { components } from "@newsekolah/api-client";
import { useMe } from "@newsekolah/api-client/react";
import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { useApiClient } from "../api/client";

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
 * separate manual refresh call required. After a successful login,
 * `useLogin`'s `onSuccess` clears the whole query cache (so a previous
 * account's data, or a previous account's cached *error* on some other
 * query, never leaks into the new session -- see that hook's doc comment)
 * and seeds this same `me` query straight from the login response, so this
 * flips to "authenticated" on its own with no anonymous gap; no extra
 * wiring needed at the call site.
 */
export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  const client = useApiClient();
  const { data, isLoading } = useMe(client);

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
