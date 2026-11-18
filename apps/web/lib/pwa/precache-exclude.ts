/**
 * Which webpack assets stay out of the service worker's precache
 * (`exclude` in `next.config.ts`).
 *
 * Per-route App Router chunks change on every deploy and are only needed
 * for the route the visitor is on, so precaching every route's chunk would
 * make each install download the whole app for nothing. The exception is
 * the `/offline` page: it is precached so the worker can show it with no
 * network, and it can only hydrate (and its retry button only works) if
 * the route chunks its own document loads are precached with it.
 *
 * Imported by `next.config.ts`, so this file stays plain TypeScript with no
 * imports.
 */

/** Where per-route chunks live, for example `static/chunks/app/(app)/dashboard/page-<hash>.js`. */
const ROUTE_CHUNK_DIRECTORY = "/chunks/app/";

/**
 * The route chunks the `/offline` document loads: the root layout and the
 * root special files that wrap every page (error, global error, not found,
 * loading), the `(public)` group's layout, and the offline page itself.
 * `[^/]+` is the content hash; it cannot cross a directory, so another
 * route's layout or page never matches.
 */
const OFFLINE_DOCUMENT_CHUNK =
  /\/chunks\/app\/(?:layout|error|global-error|not-found|loading|\(public\)\/layout|\(public\)\/offline\/page)-[^/]+\.js$/;

/** True for a route chunk the precached `/offline` document needs. */
export function isOfflineDocumentChunk(assetName: string): boolean {
  return OFFLINE_DOCUMENT_CHUNK.test(assetName);
}

/** True for a webpack asset that must not be precached. */
export function isExcludedFromPrecache(assetName: string): boolean {
  return assetName.includes(ROUTE_CHUNK_DIRECTORY) && !isOfflineDocumentChunk(assetName);
}
