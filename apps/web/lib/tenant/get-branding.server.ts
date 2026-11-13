import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { API_INTERNAL_URL } from "../env";

import type { TenantBranding } from "./tenant-provider";

/**
 * Server-only fetch of the public branding endpoint, used by the root
 * layout (locale, product name) and the manifest route handler (name,
 * icons, theme color). Forwards the browser's own Host so a multi-tenant
 * deployment resolves the same school the request is actually for;
 * `TENANCY_MODE=single` deployments ignore it. Any failure (network,
 * unknown tenant) resolves to `undefined` so callers fall back to the
 * documented defaults (locale "id", product name "SION") instead of
 * breaking the page.
 */
async function fetchTenantBrandingServer(): Promise<TenantBranding | undefined> {
  if (!API_INTERNAL_URL) return undefined;
  try {
    const incomingHost = (await headers()).get("host");
    const response = await fetch(`${API_INTERNAL_URL}/v1/tenant/branding`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      headers: incomingHost ? { "X-Forwarded-Host": incomingHost } : undefined,
    });
    if (!response.ok) return undefined;
    return (await response.json()) as TenantBranding;
  } catch {
    return undefined;
  }
}

/**
 * One render pass reads the branding from the root layout, the i18n request
 * config, `generateMetadata`, the (app) layout and several nested layouts.
 * `cache()` shares a single upstream call per request; without it each
 * page load cost the API five or more hits on a rate-limited public
 * endpoint (429 after a few dozen navigations).
 */
export const getTenantBrandingServer = cache(fetchTenantBrandingServer);
