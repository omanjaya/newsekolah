"use client";

import { clearReaderCache } from "@newsekolah/api-client/react";
import { useQueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../api/access-token";
import { useApiClient } from "../api/client";
import { clearSimulation } from "../simulation/clock";

/**
 * Drops what lets this tab act for a session it ended on purpose: the
 * simulated clock, the app's access token, and the one the API client
 * kept from its last refresh. Without the last, requests would keep
 * carrying that token, which can name a session still alive on the server
 * (the admin's own, after an impersonation), and the sign-in page would
 * read the tab as signed in. Leaves the cache alone; see useEndSession.
 */
export function useForgetSession(): () => void {
  const client = useApiClient();
  return () => {
    clearSimulation();
    setAccessToken(null);
    client.forgetAccessToken();
  };
}

/**
 * useForgetSession, then empties the cache but for the tenant's branding
 * (clearReaderCache), so the next screen starts signed out. For a session
 * that is over: an impersonation whose stop the server confirmed, or the
 * expired role-testing strip's "sign in again". The caller goes to the
 * sign-in page right after, which renders every screen afresh.
 */
export function useEndSession(): () => void {
  const forgetSession = useForgetSession();
  const queryClient = useQueryClient();
  return () => {
    forgetSession();
    clearReaderCache(queryClient);
  };
}
