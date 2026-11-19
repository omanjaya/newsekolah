import { describe, expect, it } from "vitest";

import {
  PLATFORM_ACCENTS,
  contrastRatio,
  darkVariantOf,
  foregroundFor,
  lightVariantOf,
  parseHex,
  resolveTenantAccents,
  strongVariantOf,
} from "./accent";

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

describe("resolveTenantAccents", () => {
  it("uses the token pair, not a derivation, when a tenant has no colour", () => {
    expect(resolveTenantAccents(undefined)).toEqual(PLATFORM_ACCENTS);
    expect(resolveTenantAccents(null)).toEqual(PLATFORM_ACCENTS);
    expect(resolveTenantAccents("not-a-colour")).toEqual(PLATFORM_ACCENTS);
  });

  it("uses the token pair for the platform's own accent, in any notation", () => {
    for (const hex of ["#0F7A5F", "#0f7a5f", " 0F7A5F "]) {
      const accents = resolveTenantAccents(hex);
      expect(accents.dark).toBe("#2FD6A0");
      expect(accents.darkFg).toBe("#06261D");
      expect(accents.light).toBe("#0F7A5F");
      expect(accents.lightFg).toBe("#FFFFFF");
    }
  });

  it("still derives contrast-safe variants for a custom brand colour", () => {
    const accents = resolveTenantAccents("#7B1113");
    expect(accents.dark).toBe(darkVariantOf("#7B1113"));
    expect(accents.light).toBe(lightVariantOf("#7B1113"));
    expect(ratioOnDark(accents.dark)).toBeGreaterThanOrEqual(4.5);
    const dark = parseHex(accents.dark);
    const darkFg = parseHex(accents.darkFg);
    if (!dark || !darkFg) throw new Error("Invalid derived pair");
    expect(contrastRatio(dark, darkFg)).toBeGreaterThanOrEqual(4.5);
  });
});

// A navy primary button turned platform green on hover and press, because
// `accent-strong` stayed the token (audit r3-n42).
describe("accent-strong for a tenant colour", () => {
  it("keeps the platform's own strong shades for the platform accent", () => {
    expect(resolveTenantAccents(undefined).lightStrong).toBe("#0A5340");
    expect(resolveTenantAccents("#0F7A5F").darkStrong).toBe("#26B389");
  });

  it("shades the school's own colour, not the platform green", () => {
    const accents = resolveTenantAccents("#1F3A5F");
    expect(accents.light).toBe("#1F3A5F");
    expect(accents.lightStrong).toBe(strongVariantOf(accents.light, accents.lightFg));
    // Darker navy under the white label.
    expect(accents.lightStrong).toBe("#192E4C");
    expect(accents.darkStrong).toBe(strongVariantOf(accents.dark, accents.darkFg));
    for (const strong of [accents.lightStrong, accents.darkStrong]) {
      expect(strong).not.toBe(PLATFORM_ACCENTS.lightStrong);
      expect(strong).not.toBe(PLATFORM_ACCENTS.darkStrong);
    }
  });

  it.each(["#FFFFFF", "#FFFF00", "#6288BC", "#1F3A5F", "#000000", "#00FF00", "#F0F", "#8B4513"])(
    "gives %s a distinct hover shade that keeps its label readable",
    (hex) => {
      const accents = resolveTenantAccents(hex);
      for (const [accent, fg, strong] of [
        [accents.light, accents.lightFg, accents.lightStrong],
        [accents.dark, accents.darkFg, accents.darkStrong],
      ] as const) {
        const [a, f, s] = [parseHex(accent), parseHex(fg), parseHex(strong)];
        if (!a || !f || !s) throw new Error("Invalid derived shade");
        expect(strong).not.toBe(accent);
        // The label only gains contrast, except on pure black or white,
        // where the shade turns back and the label still keeps twice 4.5:1.
        expect(contrastRatio(s, f)).toBeGreaterThanOrEqual(Math.min(contrastRatio(a, f), 4.5 * 2));
      }
    },
  );
});
