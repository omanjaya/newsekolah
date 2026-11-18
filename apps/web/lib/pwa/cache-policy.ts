/**
 * Which Cache Storage caches may exist on this origin.
 *
 * Schools install the app on shared computers, and a cache entry is found
 * by URL alone: the API sends no `Vary: Authorization`, so whatever one
 * account's request stored answers the next account's request for the same
 * URL. The service worker therefore keeps only content that is identical
 * for every account (see `runtime-caching.ts`), and everything else in
 * Cache Storage is treated as left over from an older worker and deleted.
 *
 * Shared by the service worker (`app/sw.ts`, on activation) and the page
 * (`lib/session/account-boundary.tsx`, whenever the signed-in account
 * changes), so the two can never disagree about what is safe to keep.
 */

/** The one runtime cache: hashed build output under `/_next/static/`. */
export const STATIC_ASSET_CACHE_NAME = "next-static-assets";

/**
 * Serwist names its precache `serwist-precache-v2-<scope>`. Matched by
 * prefix because the scope suffix is only known inside the worker.
 */
const PRECACHE_NAME_PREFIX = "serwist-precache";

/**
 * The runtime caches earlier versions of the worker wrote to (Serwist's
 * `defaultCache`). Deleting a cache by name needs no list, but Serwist's
 * expiration plugin also recorded every URL it cached (API paths with
 * record ids and search terms) in IndexedDB, filed under these names, and
 * those records are only reachable by name (`app/sw.ts`).
 */
export const LEGACY_RUNTIME_CACHE_NAMES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "cross-origin",
  "apis",
  "next-data",
  "next-image",
  "next-static-js-assets",
  "static-js-assets",
  "static-style-assets",
  "static-image-assets",
  "static-font-assets",
  "static-audio-assets",
  "static-video-assets",
  "static-data-assets",
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
] as const;

/** True for a cache whose entries are the same for every account. */
export function isAccountNeutralCache(name: string): boolean {
  return name === STATIC_ASSET_CACHE_NAME || name.startsWith(PRECACHE_NAME_PREFIX);
}

type CacheStore = Pick<CacheStorage, "keys" | "delete">;

/**
 * Deletes every cache that is not account-neutral and returns the names it
 * removed. Never throws: Cache Storage is missing outside secure contexts
 * and can be refused in private browsing, and neither may break a sign-in,
 * a sign-out or the worker's activation.
 */
export async function deleteAccountScopedCaches(store?: CacheStore): Promise<string[]> {
  try {
    const target = store ?? (typeof caches === "undefined" ? undefined : caches);
    if (!target) return [];
    const doomed = (await target.keys()).filter((name) => !isAccountNeutralCache(name));
    await Promise.all(doomed.map((name) => target.delete(name)));
    return doomed;
  } catch {
    return [];
  }
}
