import { vars } from "nativewind";

// Hijau Segar (docs/design-reference-hijau-segar.html, mirrored in
// theme/tokens.json): default accent #0F7A5F, overridable per tenant at
// runtime through GET /v1/tenant/branding. Each surface below is the
// *harder* of that theme's two backgrounds (bg and card) to clear 4.5:1
// against -- light mode darkens the accent toward black, so its harder
// target is the darker of the two (bg, #F7F6F2); dark mode brightens the
// accent toward white, so its harder target is the lighter of the two
// (card, #1C1C1C) -- kept as literal RGB triplets here (rather than
// importing tokens.json) so this module's contrast search has no
// dependency on the theme layer's own shape.
const DEFAULT_ACCENT_HEX = "#0F7A5F";
const LIGHT_SURFACE = [247, 246, 242] as const;
const DARK_SURFACE = [28, 28, 28] as const;

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return hexToRgb(DEFAULT_ACCENT_HEX);
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.max(0, Math.min(255, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function contrastRatio(foreground: number, background: number): number {
  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Picks the strongest accessible foreground for a tenant accent background. */
export function foregroundFor(accentColorHex: string): "#000000" | "#FFFFFF" {
  const luminance = relativeLuminance(hexToRgb(accentColorHex));
  return contrastRatio(0, luminance) >= contrastRatio(1, luminance) ? "#000000" : "#FFFFFF";
}

/** Returns an accent variant that remains readable as text in the active theme. */
export function getAccentColors(
  accentColorHex: string | undefined,
  scheme: "light" | "dark" = "light",
): { accent: string; foreground: "#000000" | "#FFFFFF" } {
  const source = hexToRgb(accentColorHex ?? DEFAULT_ACCENT_HEX);
  const surface = scheme === "dark" ? DARK_SURFACE : LIGHT_SURFACE;
  const surfaceLuminance = relativeLuminance([...surface] as [number, number, number]);
  const direction = scheme === "dark" ? 1 : -1;
  let candidate = source;
  for (let step = 0; step <= 100; step += 1) {
    candidate = source.map((channel) =>
      Math.round(
        direction === 1 ? channel + ((255 - channel) * step) / 100 : channel * (1 - step / 100),
      ),
    ) as [number, number, number];
    if (contrastRatio(relativeLuminance(candidate), surfaceLuminance) >= 4.5) break;
  }
  const accent = toHex(candidate);
  return { accent, foreground: foregroundFor(accent) };
}

function hexToRgbTriplet(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return hexToRgbTriplet(DEFAULT_ACCENT_HEX);
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${String(r)} ${String(g)} ${String(b)}`;
}

/** Style object to spread onto the app root so every `accent-*` / `bg-accent`
 * class below it resolves to the tenant's branding color for this session. */
export function accentVars(
  accentColorHex?: string,
  scheme: "light" | "dark" = "light",
): Record<string, string> {
  const colors = getAccentColors(accentColorHex, scheme);
  return vars({
    "--color-accent": hexToRgbTriplet(colors.accent),
    "--color-accent-fg": colors.foreground,
  });
}
