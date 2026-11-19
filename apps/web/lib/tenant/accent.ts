/**
 * A tenant supplies one accent colour, chosen against a white page. Used
 * unchanged on the dark surface it usually fails: the default `#0F7A5F`
 * measures 3.11:1 against `#211F1B`, under the 4.5:1 text threshold. This
 * derives the dark-theme sibling the school never supplied.
 *
 * The platform's own accent is not derived: a tenant without branding, or
 * one whose colour is the platform default, gets the designed token pair
 * (`#2FD6A0` in dark mode), not the muted derivation (`#409680`).
 */
import { colors } from "@newsekolah/ui-tokens/dist/tokens.ts";

/** The Hijau Segar dark surface (docs/07-ui-ux.md); the colour every derived accent is judged against. */
const DARK_SURFACE = { r: 0x21, g: 0x1f, b: 0x1b };

/**
 * 4.5:1, the text threshold rather than the 3:1 graphic one, because the
 * accent is used as a text colour (links, `Badge` variant="accent") and not
 * only as a marker.
 */
const TARGET_CONTRAST = 4.5;

/**
 * A fully saturated accent reads as neon once it is lightened this far, so
 * saturation is capped on the way for a tenant's own colour. The platform
 * accent skips this derivation entirely (resolveTenantAccents): its dark
 * sibling `#2FD6A0` is designed, not lightened.
 */
const MAX_DARK_SATURATION = 0.4;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** The colour the browser will actually paint, so contrast is measured on that. */
function roundChannels({ r, g, b }: Rgb): Rgb {
  const clamp = (n: number) => Math.round(Math.min(255, Math.max(0, n)));
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** Keep accent text readable on both light page backgrounds and white surfaces. */
export function lightVariantOf(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#0F7A5F";
  const background = { r: 0xf7, g: 0xf6, b: 0xf2 };
  for (let factor = 1; factor >= 0; factor -= 0.01) {
    const candidate = roundChannels({ r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor });
    if (contrastRatio(candidate, background) >= TARGET_CONTRAST) return toHex(candidate);
  }
  return "#000000";
}

/** Black or white always supplies at least 4.5:1 against an opaque accent. */
export function foregroundFor(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#FFFFFF";
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  return contrastRatio(rgb, white) >= contrastRatio(rgb, black) ? "#FFFFFF" : "#000000";
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255] as [number, number, number];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);

  let r = 0;
  let g = 0;
  let b = 0;
  if (sector === 0) [r, g, b] = [c, x, 0];
  else if (sector === 1) [r, g, b] = [x, c, 0];
  else if (sector === 2) [r, g, b] = [0, c, x];
  else if (sector === 3) [r, g, b] = [0, x, c];
  else if (sector === 4) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * The same hue, lightened until it clears TARGET_CONTRAST on the dark
 * surface. Returns the input unchanged when it already passes (a school
 * whose brand colour is bright) and falls back to the input when the string
 * is not a colour at all, leaving the stylesheet's own default in charge.
 */
export function darkVariantOf(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  if (contrastRatio(rgb, DARK_SURFACE) >= TARGET_CONTRAST) return toHex(rgb);

  const { h, s } = rgbToHsl(rgb);
  const saturation = Math.min(s, MAX_DARK_SATURATION);
  // One percent of lightness at a time: coarser steps overshoot into a
  // washed-out tint on colours that only just miss the threshold.
  //
  // Each candidate is measured after rounding to 8-bit channels, not
  // before. Rounding moves the colour, and on a near-miss it moves it the
  // wrong way: the float #1F3A5F candidate cleared 4.5 and the hex the
  // browser actually paints came back 4.4958.
  for (let l = 0.3; l <= 0.9; l += 0.01) {
    const candidate = roundChannels(hslToRgb(h, saturation, l));
    if (contrastRatio(candidate, DARK_SURFACE) >= TARGET_CONTRAST) return toHex(candidate);
  }
  return toHex(roundChannels(hslToRgb(h, saturation, 0.9)));
}

/** How far the hover and press shade moves from the accent, toward black or white. */
const STRONG_MIX = 0.2;

/**
 * The hover and press shade of a filled accent surface (`accent-strong`):
 * the same hue, moved away from the label colour written on it, so the
 * label only gains contrast. With a white label (the usual light-theme
 * accent) it darkens, which also darkens hover text on a light page; with a
 * dark label (the usual lightened dark-theme accent) it lightens, which
 * also lifts hover text on the dark surface. An accent already at that end
 * (pure black or white) has nowhere to go, so it moves the other way; the
 * label keeps far more than 4.5:1 there.
 */
export function strongVariantOf(hex: string, fg: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const awayFromLabel = fg.toUpperCase() === "#FFFFFF" ? 0 : 255;
  const shade = (target: number) => {
    const mix = (channel: number) => channel + (target - channel) * STRONG_MIX;
    return toHex(roundChannels({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) }));
  };
  const strong = shade(awayFromLabel);
  return strong === toHex(rgb) ? shade(255 - awayFromLabel) : strong;
}

/**
 * One accent per theme, each with the label colour a filled button writes
 * on it and the shade it takes on hover and press.
 */
export interface TenantAccents {
  light: string;
  lightFg: string;
  lightStrong: string;
  dark: string;
  darkFg: string;
  darkStrong: string;
}

/** The Hijau Segar accent pair, straight from the design tokens. */
export const PLATFORM_ACCENTS: TenantAccents = {
  light: colors.light.accent,
  lightFg: colors.light.accentFg,
  lightStrong: colors.light.accentStrong,
  dark: colors.dark.accent,
  darkFg: colors.dark.accentFg,
  darkStrong: colors.dark.accentStrong,
};

/**
 * The accents to paint for a tenant's branding colour: the token pair when
 * there is no usable colour or it is the platform's own, otherwise the
 * contrast-safe light and dark variants derived from it.
 */
export function resolveTenantAccents(supplied: string | null | undefined): TenantAccents {
  const rgb = supplied ? parseHex(supplied) : null;
  const platform = parseHex(PLATFORM_ACCENTS.light);
  const isPlatformDefault =
    rgb !== null &&
    platform !== null &&
    rgb.r === platform.r &&
    rgb.g === platform.g &&
    rgb.b === platform.b;
  if (!supplied || !rgb || isPlatformDefault) return PLATFORM_ACCENTS;
  const light = lightVariantOf(supplied);
  const dark = darkVariantOf(supplied);
  const lightFg = foregroundFor(light);
  const darkFg = foregroundFor(dark);
  return {
    light,
    lightFg,
    lightStrong: strongVariantOf(light, lightFg),
    dark,
    darkFg,
    darkStrong: strongVariantOf(dark, darkFg),
  };
}
