import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * True for the tenant's public branding (`queryKeys.tenantBranding`): the
 * one query that names the school rather than whoever reads it. The web
 * app seeds it from the server once per page load, and the endpoint behind
 * it is public and rate limited, so it is kept when the reader changes.
 */
export function isTenantBrandingQuery(queryKey: QueryKey): boolean {
  return queryKey[0] === "tenant" && queryKey[1] === "branding";
}

/**
 * Empties the cache when the person reading changes (a sign-in, a
 * sign-out). No query key names the reader, so whatever is left would be
 * shown to the next one. Removes every query but the tenant's branding,
 * and every mutation, as `queryClient.clear()` would.
 *
 * Removing a query does not notify a component still showing it: that
 * component keeps its data until it renders again, and only then reads
 * afresh. A sign-in or a sign-out navigates right after this, which
 * renders the next screen anyway.
 */
export function clearReaderCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => !isTenantBrandingQuery(query.queryKey) });
  queryClient.getMutationCache().clear();
}
