import type { RuntimeCaching } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly } from "serwist";

import { STATIC_ASSET_CACHE_NAME } from "./cache-policy";

/**
 * The service worker's complete runtime routing table (`app/sw.ts`).
 *
 * It is an allow-list. The worker used to take Serwist's `defaultCache` and
 * remove the rules that looked risky; the rules nobody removed went on
 * storing signed-in HTML, RSC payloads and API responses by URL, and a
 * shared school computer then served one account's copy to the next
 * account. Here a request is answered by the worker only when a rule below
 * names it. Everything else (the API, realtime, RSC payloads, object
 * storage, other origins, route handlers) matches no route, so the browser
 * fetches it exactly as if there were no service worker.
 *
 * Two rules:
 * - Navigations always go to the network (through the navigation preload
 *   response) and nothing is kept. Only when the network fails does the
 *   precached `/offline` page answer (`fallbacks` in `app/sw.ts`). There is
 *   no timeout: a slow school connection keeps waiting for the real page
 *   instead of being shown the offline page.
 * - Next's hashed build output under `/_next/static/` on this origin is
 *   served from one cache: those files are immutable and identical for
 *   every account.
 */

/**
 * The part of Serwist's match options the matchers read. Narrower than
 * Serwist's own `RouteMatchCallbackOptions`, whose `event` is a
 * service-worker type this app's DOM type library does not have, and plain
 * enough for tests to build without a real `FetchEvent`.
 */
export interface RouteMatchInput {
  url: URL;
  sameOrigin: boolean;
  request: Pick<Request, "mode">;
}

/** A runtime rule whose matcher can be called with a {@link RouteMatchInput}. */
export interface RuntimeRule extends RuntimeCaching {
  matcher: (input: RouteMatchInput) => boolean;
}

const STATIC_ASSET_PATH_PREFIX = "/_next/static/";

// One build emits a few hundred files, and only the ones the precache does
// not already hold (per-route chunks, oversized chunks) land here. Old
// builds' files are never requested again after a deploy, so they age out
// once nobody has used them for a month.
const STATIC_ASSET_MAX_ENTRIES = 256;
const STATIC_ASSET_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * A document load: the address bar, a link, a reload. Both rules are GET
 * only (Serwist's default method), so a form that posts a page is never
 * handled by the worker.
 */
export function isNavigationRequest({ request }: RouteMatchInput): boolean {
  return request.mode === "navigate";
}

/** Next's hashed build output on this origin: scripts, styles, fonts, media. */
export function isStaticBuildAsset({ url, sameOrigin }: RouteMatchInput): boolean {
  return sameOrigin && url.pathname.startsWith(STATIC_ASSET_PATH_PREFIX);
}

/**
 * Builds the rules fresh on every call: Serwist adds its offline-fallback
 * plugin to each strategy it is given, so instances must not be shared.
 */
export function buildRuntimeCaching(): RuntimeRule[] {
  return [
    {
      matcher: isNavigationRequest,
      handler: new NetworkOnly(),
    },
    {
      matcher: isStaticBuildAsset,
      handler: new CacheFirst({
        cacheName: STATIC_ASSET_CACHE_NAME,
        plugins: [
          new ExpirationPlugin({
            maxEntries: STATIC_ASSET_MAX_ENTRIES,
            maxAgeSeconds: STATIC_ASSET_MAX_AGE_SECONDS,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
  ];
}
