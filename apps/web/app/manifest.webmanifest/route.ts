import { getTenantBrandingServer } from "../../lib/tenant/get-branding.server";
import { PRODUCT_NAME_FALLBACK } from "../../lib/tenant/product-name";
import { THEME_COLOR } from "../../lib/theme/theme-color";

/**
 * Route handler (not the static `app/manifest.ts` convention) so the
 * manifest reflects the resolved tenant's own name, icon, and theme color
 * on every request, per the build brief. Forced dynamic: this reads the
 * incoming request's Host via `headers()` (see get-branding.server.ts) to
 * resolve the right tenant, so it must never be prerendered once at build
 * time and served identically to every school.
 *
 * The installed app opens standalone on the page colour of the "Hijau
 * Segar" tokens (the splash and the status bar match the phone header,
 * the same colour the `theme-color` meta carries), while the icon keeps
 * the school's own accent. A generated icon also comes as `maskable`: the
 * same initials on a full-bleed square with the mark inside the central
 * safe zone, so a launcher's circle or squircle mask never clips it. A
 * school's uploaded logo has no known safe zone, so it stays `any` only.
 */
export const dynamic = "force-dynamic";

const ICON_SIZES = [192, 512] as const;

export async function GET(): Promise<Response> {
  const branding = await getTenantBrandingServer();
  const name = branding?.name ?? PRODUCT_NAME_FALLBACK;
  const shortName = branding?.short_name ?? name.slice(0, 12);
  const accentColor = branding?.accent_color ?? "#0F7A5F";

  const generated = (maskable: boolean) =>
    ICON_SIZES.map((size) => {
      const query = new URLSearchParams({ name, color: accentColor });
      if (maskable) query.set("maskable", "1");
      return {
        src: `/branding-icon?${query.toString()}`,
        sizes: `${String(size)}x${String(size)}`,
        type: "image/svg+xml",
        purpose: maskable ? ("maskable" as const) : ("any" as const),
      };
    });

  const icons = branding?.logo_url
    ? [{ src: branding.logo_url, sizes: "any", type: "image/png", purpose: "any" }]
    : [...generated(false), ...generated(true)];

  const manifest = {
    id: "/dashboard",
    name,
    short_name: shortName,
    description: branding?.tagline ?? "Sistem informasi sekolah",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    lang: branding?.locale ?? "id",
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    icons,
  };

  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
