import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { cookies } from "next/headers";

import { API_INTERNAL_URL } from "../env";

import { ACCESS_COOKIE_NAME } from "./access-cookie";

/**
 * Query key must mirror `packages/api-client/src/query-keys.ts`'s
 * `queryKeys.me()` exactly -- `useMe` reads its cache under that key, and a
 * mismatch here would make this prefetch dead weight (data cached under a
 * key nothing ever reads). Not imported directly: `@newsekolah/api-client`
 * is a browser-oriented package (it also ships React hooks), and pulling it
 * into a Server Component file for one constant is not worth the coupling.
 */
const ME_QUERY_KEY = ["me"] as const;

/**
 * Matches `lib/query/query-provider.tsx`'s global `staleTime` so the
 * `QueryClient` `HydrationBoundary` merges into on the client does not
 * immediately treat this prefetched entry as stale and refetch it.
 */
const ME_STALE_TIME_MS = 30_000;

/**
 * Server-side counterpart of `useMe`, now wired up (docs/16-audit-performa-web.md
 * item 1: every cold load used to wait on HTML -> JS -> hydrate ->
 * `GET /v1/me` before any page query could start).
 *
 * `GET /v1/me` only accepts a Bearer access token
 * (`apps/api/internal/platform/auth/middleware.go`'s `bearerToken` -- no
 * cookie fallback), and the access token is never stored anywhere a plain
 * Server Component could read it. What makes this safe to call from here is
 * the `sat` cookie `middleware.ts` mints on document navigations
 * (docs/08-security.md section 2, "Server-side access cookie"): by the time
 * a Server Component runs, that cookie either already holds a short-lived
 * access token (minted moments ago, bounded by
 * `ACCESS_COOKIE_MAX_AGE_SECONDS`) or is absent, in which case this simply
 * hydrates an empty cache and `useMe` behaves exactly as before (client-side
 * boot refresh, then `GET /v1/me`).
 *
 * This function itself never touches `POST /v1/auth/refresh` or the
 * `refresh_token` cookie -- that rotation, and the reuse-detection hazard
 * described in docs/08-security.md section 2, live entirely in
 * `middleware.ts`, which is the one place that owns the actual navigation
 * response and can relay a rotated cookie back to the browser. A Server
 * Component cannot do that (`cookies().set()` throws outside a Server
 * Action / Route Handler / Middleware), which is why this file previously
 * had to stay unwired -- see git history for the original reasoning.
 */
export async function dehydrateAppQueryClient(): Promise<DehydratedState> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: ME_STALE_TIME_MS } },
  });

  const accessToken = (await cookies()).get(ACCESS_COOKIE_NAME)?.value;
  if (accessToken && API_INTERNAL_URL) {
    // `query()` (replacing the deprecated `prefetchQuery`) throws on
    // failure, unlike its predecessor -- swallowed here on purpose: a
    // failed `queryFn` still leaves the query in an error state, which
    // `dehydrate()` below excludes by default, so this degrades to the
    // same "empty cache" state as no cookie at all, exactly as the
    // deprecation notice's own suggested `.catch(noop)` pattern intends.
    await queryClient
      .query({
        queryKey: ME_QUERY_KEY,
        queryFn: async () => {
          const response = await fetch(`${API_INTERNAL_URL}/v1/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
            signal: AbortSignal.timeout(3000),
          });
          if (!response.ok) {
            throw new Error(`GET /v1/me failed with ${response.status}`);
          }
          return (await response.json()) as unknown;
        },
        staleTime: ME_STALE_TIME_MS,
      })
      .catch(() => undefined);
  }

  return dehydrate(queryClient);
}
