import type { NextRequest } from "next/server";

import { initialsFor } from "../../lib/tenant/initials";
import { PRODUCT_NAME_FALLBACK } from "../../lib/tenant/tenant-provider";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * Generated icon fallback for tenants without a `logo_url` (docs/07-ui-ux.md,
 * manifest requirement). Deterministic initials on the tenant's own accent
 * color, radius 8 per DESIGN.md (icons are not avatars, so not the 999
 * "avatar only" radius). Returned as SVG so one route serves every icon
 * size the manifest asks for.
 */
export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") ?? PRODUCT_NAME_FALLBACK;
  const requestedColor = searchParams.get("color") ?? "";
  const color = HEX_COLOR.test(requestedColor) ? requestedColor : "#1F3A5F";
  const initials = initialsFor(name);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" rx="24" fill="${color}" />
  <text x="96" y="96" dy="0.35em" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="76" font-weight="500" fill="#FFFFFF">${initials}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
