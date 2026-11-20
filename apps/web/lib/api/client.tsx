"use client";

import { createApiClient, type NewsekolahApiClient } from "@newsekolah/api-client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { API_URL } from "../env";
import { isAnonymousPublicVisit } from "../session/access-cookie";
import { getSimulationTime, refuseSimulation } from "../simulation/clock";

import { getAccessToken, setAccessToken } from "./access-token";

const ApiClientContext = createContext<NewsekolahApiClient | null>(null);

/** What `onUnauthorized` gets, to end the session with. */
export interface ExpiredSession {
  client: NewsekolahApiClient;
  /** The cache the session's reads live in. */
  queryClient: QueryClient;
}

export interface ApiClientProviderProps {
  locale: string;
  /**
   * Called when a 401 survives the client's own refresh-and-retry, once
   * the app's access token has been dropped. Gets the client and the query
   * cache, so a caller that sends the reader to sign in can end the session
   * completely first (lib/session/end-session.ts). Must be a stable
   * reference (wrap it in `useCallback` at the call site): it is a
   * `useMemo` dependency here, so a new function identity on every render
   * would rebuild the whole API client instance for no reason.
   */
  onUnauthorized: (session: ExpiredSession) => void;
  /**
   * Whether the document request carried the refresh cookie (root layout).
   * Without it a public page sends no refresh at all (isAnonymousPublicVisit).
   */
  sessionCookieSeen: boolean;
  children: ReactNode;
}

/**
 * Builds the single `NewsekolahApiClient` instance for the app:
 * `getAccessToken` reads the in-memory token (see access-token.ts), and
 * `credentials: "include"` sends the httpOnly refresh cookie automatically.
 * Rebuilt only when `locale` or `onUnauthorized` actually change, which in
 * practice is close to never (locale comes from tenant branding, not a
 * per-render value). Rendered inside QueryProvider, whose client never
 * changes.
 */
export function ApiClientProvider({
  locale,
  onUnauthorized,
  sessionCookieSeen,
  children,
}: ApiClientProviderProps): ReactElement {
  const queryClient = useQueryClient();
  const client = useMemo(() => {
    const created: NewsekolahApiClient = createApiClient({
      baseUrl: API_URL,
      credentials: "include",
      clientHeader: "web/0.1.0",
      getAccessToken,
      onAccessToken: setAccessToken,
      getLocale: () => locale,
      getSimulationTime,
      onSimulationRefused: refuseSimulation,
      // Read at each request, not once: a client-side navigation from the
      // catalogue into the app restores the session there.
      skipBootRefresh: () =>
        typeof window !== "undefined" &&
        isAnonymousPublicVisit(window.location.pathname, sessionCookieSeen),
      onUnauthorized: () => {
        setAccessToken(null);
        onUnauthorized({ client: created, queryClient });
      },
    });
    return created;
  }, [locale, onUnauthorized, queryClient, sessionCookieSeen]);

  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): NewsekolahApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error("useApiClient must be used within ApiClientProvider");
  }
  return client;
}
