// WCAG 2.x relative luminance and contrast ratio, used by contrast-check.ts
// and by the build script's own test suite. Pure math, no dependencies, so
// the assertions never depend on a third-party contrast library's rounding.

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

/** Parses `#RRGGBB` or `rgba(r, g, b, a)` / `rgb(r, g, b)`. */
export function parseColor(value: string): Rgba {
  const trimmed = value.trim();
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    trimmed,
  );
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  const clean = trimmed.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`Unsupported color: ${value}`);
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
    a: 1,
  };
}

function toHex({ r, g, b }: Rgba): string {
  const part = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * The opaque color a translucent `top` paints over an opaque `bottom`
 * (source-over), as an 8-bit `#RRGGBB`. Opaque `top` comes back unchanged.
 */
export function composite(top: string, bottom: string): string {
  const over = parseColor(top);
  const under = parseColor(bottom);
  if (under.a !== 1) throw new Error(`composite() needs an opaque bottom color, got ${bottom}`);
  const mix = (front: number, back: number) => front * over.a + back * (1 - over.a);
  return toHex({ r: mix(over.r, under.r), g: mix(over.g, under.g), b: mix(over.b, under.b), a: 1 });
}

export function relativeLuminance(color: string): number {
  const { r, g, b, a } = parseColor(color);
  if (a !== 1) throw new Error(`relativeLuminance() needs an opaque color, got ${color}`);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** Contrast ratio between two opaque colors, rounded to 2 decimals, range 1-21. */
export function contrastRatio(colorA: string, colorB: string): number {
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3.0;
export const AA_NON_TEXT = 3.0;
