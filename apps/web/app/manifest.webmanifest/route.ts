import { getTenantBrandingServer } from "../../lib/tenant/get-branding.server";
import { PRODUCT_NAME_FALLBACK } from "../../lib/tenant/tenant-provider";

/**
 * Route handler (not the static `app/manifest.ts` convention) so the
 * manifest reflects the resolved tenant's own name, icon, and theme color
 * on every request, per the build brief. Forced dynamic: this reads the
 * incoming request's Host via `headers()` (see get-branding.server.ts) to
 * resolve the right tenant, so it must never be prerendered once at build
 * time and served identically to every school.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const branding = await getTenantBrandingServer();
  const name = branding?.name ?? PRODUCT_NAME_FALLBACK;
  const shortName = branding?.short_name ?? name.slice(0, 12);
  const accentColor = branding?.accent_color ?? "#0F7A5F";

  const icons = branding?.logo_url
    ? [{ src: branding.logo_url, sizes: "any", type: "image/png", purpose: "any" }]
    : [192, 512].map((size) => ({
        src: `/branding-icon?name=${encodeURIComponent(name)}&color=${encodeURIComponent(accentColor)}`,
        sizes: `${size}x${size}`,
        type: "image/svg+xml",
        purpose: "any" as const,
      }));

  const manifest = {
    name,
    short_name: shortName,
    description: branding?.tagline ?? "Sistem informasi sekolah",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    lang: branding?.locale ?? "id",
    background_color: "#F7F6F2",
    theme_color: accentColor,
    icons,
  };

  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
