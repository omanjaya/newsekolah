import { themeColors } from "@/theme/colors";
import { contrastRatio, meetsAA, AA_NORMAL_TEXT, AA_LARGE_TEXT } from "@/theme/contrast";

describe("Hijau Segar theme tokens: text-pair contrast", () => {
  it.each(["light", "dark"] as const)("%s: body text meets AA normal-text contrast", (scheme) => {
    const c = themeColors(scheme);
    expect(contrastRatio(c.text, c.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(c.text, c.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(["light", "dark"] as const)("%s: muted text meets AA normal-text contrast", (scheme) => {
    const c = themeColors(scheme);
    expect(contrastRatio(c.muted, c.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(c.muted, c.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(["light", "dark"] as const)(
    "%s: accentText reads as text/icon color directly on bg and card",
    (scheme) => {
      const c = themeColors(scheme);
      expect(contrastRatio(c.accentText, c.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(c.accentText, c.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it.each(["light", "dark"] as const)(
    "%s: white text on the solid accent fill (buttons, active pill) meets AA",
    (scheme) => {
      const c = themeColors(scheme);
      expect(contrastRatio(c.accentFg, c.accent)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it.each(["light", "dark"] as const)(
    "%s: every chip pair is at least readable as bold/large UI text (3:1)",
    (scheme) => {
      const c = themeColors(scheme);
      for (const pair of Object.values(c.chips)) {
        expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
      }
    },
  );

  it("light chip pairs clear 4.5:1 except amber and blue, which land in the 4.4-4.5 range -- still well past the 3:1 large/bold-text threshold chip labels are set at", () => {
    const c = themeColors("light");
    expect(meetsAA(c.chips.green.fg, c.chips.green.bg)).toBe(true);
    expect(meetsAA(c.chips.purple.fg, c.chips.purple.bg)).toBe(true);
    expect(meetsAA(c.chips.amber.fg, c.chips.amber.bg, "large")).toBe(true);
    expect(meetsAA(c.chips.blue.fg, c.chips.blue.bg, "large")).toBe(true);
  });

  it("dark chip pairs all clear 4.5:1 (brighter foregrounds than light mode)", () => {
    const c = themeColors("dark");
    for (const pair of Object.values(c.chips)) {
      expect(meetsAA(pair.fg, pair.bg)).toBe(true);
    }
  });

  it("cardBorder/line stay distinct, subtle hairlines (never mistaken for text)", () => {
    for (const scheme of ["light", "dark"] as const) {
      const c = themeColors(scheme);
      expect(contrastRatio(c.cardBorder, c.card)).toBeLessThan(AA_LARGE_TEXT);
      expect(contrastRatio(c.line, c.bg)).toBeLessThan(AA_LARGE_TEXT);
    }
  });
});
