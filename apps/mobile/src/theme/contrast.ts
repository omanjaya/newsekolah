// WCAG relative luminance / contrast ratio helpers, shared by theme/accent.ts
// (tenant-branding contrast) and the theme token tests. Kept dependency-free
// so it can run under plain Node (tailwind.config.js's world) as well as
// Jest and the app itself.

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new Error(`invalid hex color: ${hex}`);
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio between two colors, 1 (no contrast) to 21. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** AA thresholds (WCAG 1.4.3 / 1.4.11): 4.5:1 for normal text, 3:1 for large
 * text (18.66px+, or 14px+ bold) and for graphical/UI components like an
 * icon or a chip's outline. */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;

export function meetsAA(a: string, b: string, kind: "normal" | "large" = "normal"): boolean {
  return contrastRatio(a, b) >= (kind === "normal" ? AA_NORMAL_TEXT : AA_LARGE_TEXT);
}
