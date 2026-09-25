import { Manrope, Plus_Jakarta_Sans } from "next/font/google";

/*
 * "Hijau Segar" typography (docs/07-ui-ux.md): Manrope for headings and
 * display numbers, Plus Jakarta Sans for body text. next/font downloads and
 * self-hosts both at build time (no request to fonts.googleapis.com), which
 * is what keeps them inside middleware.ts's `font-src 'self' data:` CSP.
 *
 * Each export only sets a CSS variable (`variable`); the actual
 * `font-family` wiring lives in packages/config/tailwind/preset.css
 * (`--font-sans`, `--font-heading`), so a component reaches these through
 * Tailwind's `font-sans`/`font-heading` utilities rather than importing
 * this module directly.
 */
export const manrope = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});
