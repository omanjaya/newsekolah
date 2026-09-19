import { foregroundFor, getAccentColors } from "@/theme/accent";

describe("tenant accent foreground", () => {
  it("uses white for the default dark accent", () => {
    expect(foregroundFor("#1F3A5F")).toBe("#FFFFFF");
  });

  it("uses black for a light tenant accent", () => {
    expect(foregroundFor("#FFFFFF")).toBe("#000000");
  });

  it("handles the extremes with a passing contrast choice", () => {
    expect(foregroundFor("#000000")).toBe("#FFFFFF");
    expect(foregroundFor("#FF0000")).toBe("#000000");
  });

  it.each(["#FFFFFF", "#000000", "#1F3A5F", "#6288BC", "#FFFF00", "#FF0000", "#00FF00"])(
    "renders readable accent and foreground for %s in both themes",
    (raw) => {
      for (const scheme of ["light", "dark"] as const) {
        const pair = getAccentColors(raw, scheme);
        const surfaces = scheme === "dark" ? ["#141414", "#1C1C1C"] : ["#F7F6F3", "#FFFFFF"];
        for (const surface of surfaces)
          expect(ratio(pair.accent, surface)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(pair.accent, pair.foreground)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

function ratio(a: string, b: string): number {
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  }
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
