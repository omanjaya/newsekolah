/**
 * Centralized TanStack Query keys, per docs/04-clean-code.md ("key query
 * terpusat di features/*\/keys.ts") applied at the shared-client level so
 * web and mobile invalidate the same cache entries after a mutation.
 */
export const queryKeys = {
  me: () => ["me"] as const,
  sessions: () => ["auth", "sessions"] as const,
  tenantBranding: (tenantSlug?: string) => ["tenant", "branding", tenantSlug ?? "default"] as const,
  tenantLookup: (query: string) => ["tenant", "lookup", query] as const,
};
