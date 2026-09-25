import { describe, expect, it } from "vitest";

import { contrastRatio, darkVariantOf, foregroundFor, lightVariantOf, parseHex } from "./accent";

const DARK_SURFACE = { r: 0x21, g: 0x1f, b: 0x1b };

describe("tenant accent pairs", () => {
  it.each(["#FFFFFF", "#FFFF00", "#6288BC", "#1F3A5F", "#000000", "#00FF00", "#F0F", "#8B4513"])(
    "keeps text and primary button labels readable for %s in both themes",
    (hex) => {
      for (const [accent, surface] of [
        [lightVariantOf(hex), "#F7F6F2"],
        [darkVariantOf(hex), "#211F1B"],
      ] as const) {
        const rgb = parseHex(accent);
        const background = parseHex(surface);
        const foreground = parseHex(foregroundFor(accent));
        if (!rgb || !background || !foreground) throw new Error("Invalid generated pair");
        expect(contrastRatio(rgb, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(rgb, foreground)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

function ratioOnDark(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`not a colour: ${hex}`);
  return contrastRatio(rgb, DARK_SURFACE);
}

describe("darkVariantOf", () => {
  it("lifts a legacy tenant accent off the dark surface", () => {
    // The bug this exists for: #1F3A5F is 1.43:1 on #211F1B, invisible.
    expect(ratioOnDark("#1F3A5F")).toBeLessThan(2);
    expect(ratioOnDark(darkVariantOf("#1F3A5F"))).toBeGreaterThanOrEqual(4.5);
  });

  it("lifts the current default tenant accent off the dark surface", () => {
    // #0F7A5F (Hijau Segar's accent) is only 3.11:1 on #211F1B on its own.
    expect(ratioOnDark("#0F7A5F")).toBeLessThan(4.5);
    expect(ratioOnDark(darkVariantOf("#0F7A5F"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["#1F3A5F", "#000000", "#7B1113", "#004225", "#4B0082", "#8B4513"])(
    "clears 4.5:1 for %s",
    (hex) => {
      expect(ratioOnDark(darkVariantOf(hex))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("leaves a colour that already passes untouched", () => {
    // #E8C547 is well clear of the threshold already.
    expect(ratioOnDark("#E8C547")).toBeGreaterThanOrEqual(4.5);
    expect(darkVariantOf("#E8C547")).toBe("#E8C547");
  });

  it("keeps the hue it was given", () => {
    // A red brand must not come back blue just because it was lightened.
    const derived = parseHex(darkVariantOf("#7B1113"));
    if (!derived) throw new Error("derived accent is not a colour");
    expect(derived.r).toBeGreaterThan(derived.g);
    expect(derived.r).toBeGreaterThan(derived.b);
  });

  it("returns the input unchanged when it is not a colour", () => {
    expect(darkVariantOf("not-a-colour")).toBe("not-a-colour");
    expect(darkVariantOf("")).toBe("");
  });

  it("accepts shorthand hex", () => {
    expect(ratioOnDark(darkVariantOf("#123"))).toBeGreaterThanOrEqual(4.5);
  });
});
