"use client";

import type { NewsekolahApiClient } from "@newsekolah/api-client";
import { clearReaderCache } from "@newsekolah/api-client/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { setAccessToken } from "../api/access-token";
import { useApiClient } from "../api/client";
import { clearSimulation } from "../simulation/clock";

/**
 * Drops what lets this tab act for a session that is over: the simulated
 * clock, the app's access token, and the one the API client kept from its
 * last refresh. Without the last, requests would keep carrying that token,
 * which can name a session still alive on the server (the admin's own,
 * after an impersonation), and the sign-in page would read the tab as
 * signed in. Leaves the cache alone; see endSession.
 */
export function forgetSession(client: NewsekolahApiClient): void {
  clearSimulation();
  setAccessToken(null);
  client.forgetAccessToken();
}

/**
 * forgetSession, then empties the cache but for the tenant's branding
 * (clearReaderCache), so the next screen starts signed out: with `me` left
 * in the cache the sign-in page would read the tab as signed in and send
 * it straight back. For a session that is over: an impersonation whose
 * stop the server confirmed or answered as already over, the expired
 * role-testing strip's "sign in again", or a session that ran out
 * mid-visit (app/providers.tsx). The caller goes to the sign-in page right
 * after, which renders every screen afresh.
 */
export function endSession(client: NewsekolahApiClient, queryClient: QueryClient): void {
  forgetSession(client);
  clearReaderCache(queryClient);
}

/** forgetSession for this app's API client. Used by a sign-out. */
export function useForgetSession(): () => void {
  const client = useApiClient();
  return () => {
    forgetSession(client);
  };
}

/** endSession for this app's API client and query cache. */
export function useEndSession(): () => void {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return () => {
    endSession(client, queryClient);
  };
}

/**
 * endSession, then the sign-in page with a way back to the current page:
 * the same exit app/providers.tsx takes when a session runs out mid-visit.
 * For a screen that still shows a 401 it was handed. A plain link to
 * /login would bounce straight back, since the cached `me` reads the tab
 * as signed in.
 */
export function useSignInAgain(): () => void {
  const end = useEndSession();
  const router = useRouter();
  const pathname = usePathname();
  return () => {
    end();
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  };
}
