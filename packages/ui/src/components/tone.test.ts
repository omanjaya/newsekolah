import { colors } from "@newsekolah/ui-tokens/dist/tokens.ts";
import { describe, expect, it } from "vitest";

import { TONE_CLASSES } from "./tone.js";

type Rgba = [number, number, number, number];

function parse(value: string): Rgba {
  const fn = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(value);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), Number(fn[4] ?? 1)];
  const hex = value.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba;
}

/** `top` at its own alpha times `alpha`, painted over an opaque `bottom` (source-over, sRGB). */
function over([r, g, b, a]: Rgba, bottom: Rgba, alpha = 1): Rgba {
  const k = a * alpha;
  return [r * k + bottom[0] * (1 - k), g * k + bottom[1] * (1 - k), b * k + bottom[2] * (1 - k), 1];
}

function luminance([r, g, b]: Rgba): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg", "surface", "surfaceRaised", "surfaceSunken", "surfaceOverlay"] as const;

describe("neutral soft tone", () => {
  // A badge is 12px text, so it needs 4.5:1 wherever a neutral chip can sit:
  // the page, a card, a sunken well, an overlay and a raised menu.
  it("keeps its text at 4.5:1 or more on every surface of both themes", () => {
    const alpha = /\btext-fg\/(\d+)\b/.exec(TONE_CLASSES.neutral.soft)?.[1];
    expect(TONE_CLASSES.neutral.soft).toContain("bg-state-pressed");
    expect(alpha).toBeDefined();
    for (const theme of ["light", "dark"] as const) {
      const palette = colors[theme];
      for (const surface of SURFACES) {
        const fill = over(parse(palette.statePressed), parse(palette[surface]));
        const text = over(parse(palette.fg), fill, Number(alpha) / 100);
        expect(contrast(text, fill), `${theme} ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
