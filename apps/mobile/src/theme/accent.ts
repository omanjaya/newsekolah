import { vars } from "nativewind";

// DESIGN.md: default accent #1F3A5F, overridable per tenant at runtime.
const DEFAULT_ACCENT_HEX = "#1F3A5F";

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
export function accentVars(accentColorHex?: string): Record<string, string> {
  return vars({ "--color-accent": hexToRgbTriplet(accentColorHex ?? DEFAULT_ACCENT_HEX) });
}
