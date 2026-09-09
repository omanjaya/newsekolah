"use client";

import { createApiClient, type NewsekolahApiClient } from "@newsekolah/api-client";
import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { API_URL } from "../env";

import { getAccessToken, setAccessToken } from "./access-token";

const ApiClientContext = createContext<NewsekolahApiClient | null>(null);

export interface ApiClientProviderProps {
  locale: string;
  /**
   * Called when a 401 survives the client's own refresh-and-retry. Must be
   * a stable reference (wrap it in `useCallback` at the call site): it is a
   * `useMemo` dependency here, so a new function identity on every render
   * would rebuild the whole API client instance for no reason.
   */
  onUnauthorized: () => void;
  children: ReactNode;
}

/**
 * Builds the single `NewsekolahApiClient` instance for the app:
 * `getAccessToken` reads the in-memory token (see access-token.ts), and
 * `credentials: "include"` sends the httpOnly refresh cookie automatically.
 * Rebuilt only when `locale` or `onUnauthorized` actually change, which in
 * practice is close to never (locale comes from tenant branding, not a
 * per-render value).
 */
export function ApiClientProvider({
  locale,
  onUnauthorized,
  children,
}: ApiClientProviderProps): ReactElement {
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: API_URL,
        credentials: "include",
        clientHeader: "web/0.1.0",
        getAccessToken,
        onAccessToken: setAccessToken,
        getLocale: () => locale,
        onUnauthorized: () => {
          setAccessToken(null);
          onUnauthorized();
        },
      }),
    [locale, onUnauthorized],
  );

  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): NewsekolahApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error("useApiClient must be used within ApiClientProvider");
  }
  return client;
}
