"use client";

import type { components } from "@newsekolah/api-client";
import { useMe } from "@newsekolah/api-client/react";
import { createContext, useContext } from "react";
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
 * `useLogin`'s `onSuccess` invalidates this same `me` query, so this
 * re-fetches (now with the fresh token already in memory) and flips to
 * "authenticated" on its own; no extra wiring needed at the call site.
 */
export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  const client = useApiClient();
  const { data, isLoading } = useMe(client);

  const status: SessionStatus = isLoading ? "loading" : data ? "authenticated" : "anonymous";

  return (
    <SessionContext.Provider value={{ status, me: data, isReady: !isLoading }}>
      {children}
    </SessionContext.Provider>
  );
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
