import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";

/**
 * Server-side counterpart of `useMe` (docs/16-audit-performa-web.md item 1:
 * every cold load waits on HTML -> JS -> hydrate -> `GET /v1/me` before any
 * page query can start). The intended shape is
 * `queryClient.prefetchQuery({ queryKey: queryKeys.me(), queryFn: ... })`
 * here, then `(app)/layout.tsx` wraps its children in
 * `<HydrationBoundary state={dehydrate(queryClient)}>` so `useMe` resolves
 * from cache on first render instead of firing its own request.
 *
 * That fetch is deliberately NOT wired up yet. `GET /v1/me` only accepts a
 * Bearer access token (`apps/api/internal/platform/auth/middleware.go`'s
 * `bearerToken` — no cookie fallback), and the access token is never
 * stored anywhere a server request can read it (`lib/env.ts`: kept in
 * browser memory only). The only way to mint one here is
 * `POST /v1/auth/refresh`, which *rotates* the httpOnly `refresh_token`
 * cookie and revokes the one just used — docs/08-security.md section 2 is
 * explicit that reuse of a revoked refresh token, for any reason, is
 * treated as theft and revokes the entire session family, with no grace
 * period.
 *
 * A Server Component cannot relay that rotated cookie to the browser:
 * `cookies().set()` only works in a Server Action, a Route Handler, or
 * Middleware, never in a layout/page render (Next.js throws). So a refresh
 * call made here would rotate the session server-side while the browser
 * keeps sending the now-revoked cookie. The client's own boot refresh
 * (`packages/api-client/src/client.ts`'s `ensureBootRefresh`, triggered by
 * *any* authenticated query on the page — not just `/v1/me`, so hydrating
 * `/v1/me` alone does not remove the trigger) would then present that
 * stale cookie, read as reuse, and revoke the user's whole session family.
 * That is not a rare multi-tab race: it would reproduce on very close to
 * every cold load. Shipping that would be strictly worse than the round
 * trip this is meant to remove.
 *
 * A safe version needs the rotation to happen somewhere that owns the
 * actual navigation response — `middleware.ts`, filtered to genuine
 * document navigations (Next sends `Next-Router-Prefetch` on hover/viewport
 * prefetches; skip those) so it does not rotate on every hovered `<Link>` —
 * and deserves its own review plus a full run against a real
 * Postgres-backed API rather than riding along with a bundle-splitting
 * change. Left as a follow-up (see the PR description).
 *
 * Until then this hydrates an empty cache: `useMe` behaves exactly as
 * today (client-side boot refresh, then `GET /v1/me`) underneath a
 * `HydrationBoundary` that has nothing to contribute yet. Wiring a real
 * `prefetchQuery` call in here is the only change a safe implementation
 * needs — `(app)/layout.tsx` does not change.
 */
export function dehydrateAppQueryClient(): DehydratedState {
  const queryClient = new QueryClient();
  return dehydrate(queryClient);
}
