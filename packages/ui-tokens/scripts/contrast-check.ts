// Asserts the token palette meets WCAG 2.x AA before it ships: 4.5:1 for
// text/background pairs, 3:1 for status/category colors used as non-text
// indicators and for control borders and focus rings against every surface
// they sit on. Translucent tokens (state layers, dark dividers) are
// composited over each surface first, since that is the color actually
// painted. Two floors below WCAG's scope keep decoration perceptible: a
// divider stays visible on every surface it is drawn on, and a hover layer
// visibly changes the surface it is laid over. Run via
// `pnpm test` (see package.json) and standalone via `pnpm contrast-check`.
// See docs/07-ui-ux.md ("Hijau Segar") for the source palette;
// wcag-contrast.ts implements the contrast formula.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CategoryName, SemanticName, StatusName, ThemeColors, TokensSource } from "./types.js";
import { AA_NON_TEXT, AA_NORMAL_TEXT, composite, contrastRatio } from "./wcag-contrast.js";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(
  readFileSync(resolve(here, "..", "tokens.json"), "utf-8"),
) as TokensSource;

interface Check {
  label: string;
  foreground: string;
  background: string;
  minimum: number;
}

/** A hairline that separates rows or sections: visible, never loud. */
const DIVIDER_VISIBLE = 1.15;
/** The smallest change a state layer may make to the surface under it. */
const STATE_STEP_VISIBLE = 1.08;

const STATUS_ORDER: StatusName[] = ["present", "sick", "excused", "dispensation", "absent", "late"];
const CATEGORY_ORDER: CategoryName[] = ["green", "amber", "purple", "blue", "red"];
const SEMANTIC_ORDER: SemanticName[] = ["success", "warning", "danger", "info"];

/** Every opaque surface a control, text or icon can be placed on. */
function surfaces(theme: ThemeColors): [string, string][] {
  return [
    ["bg", theme.bg],
    ["surface", theme.surface],
    ["surface-raised", theme.surfaceRaised],
    ["surface-overlay", theme.surfaceOverlay],
    ["surface-sunken", theme.surfaceSunken],
  ];
}

function baseChecks(themeName: string, theme: ThemeColors): Check[] {
  return [
    {
      label: `${themeName}: accent-fg on accent`,
      foreground: theme.accentFg,
      background: theme.accent,
      minimum: AA_NORMAL_TEXT,
    },
    {
      label: `${themeName}: accent-soft-fg on accent-soft (text on tint)`,
      foreground: theme.accentSoftFg,
      background: theme.accentSoft,
      minimum: AA_NORMAL_TEXT,
    },
    {
      label: `${themeName}: accent-fg on accent-strong (button hover/pressed)`,
      foreground: theme.accentFg,
      background: theme.accentStrong,
      minimum: AA_NORMAL_TEXT,
    },
    {
      // Button variant="danger" fills with `danger` and writes its label in `bg`.
      label: `${themeName}: bg on danger (danger button label)`,
      foreground: theme.bg,
      background: theme.category[tokens.semantic.danger].fg,
      minimum: AA_NORMAL_TEXT,
    },
  ];
}

/** Text, links, control borders and focus rings on every opaque surface. */
function surfaceChecks(themeName: string, theme: ThemeColors): Check[] {
  return surfaces(theme).flatMap(([surfaceName, surface]) => [
    {
      label: `${themeName}: fg on ${surfaceName}`,
      foreground: theme.fg,
      background: surface,
      minimum: AA_NORMAL_TEXT,
    },
    {
      label: `${themeName}: fg-muted on ${surfaceName}`,
      foreground: theme.fgMuted,
      background: surface,
      minimum: AA_NORMAL_TEXT,
    },
    {
      label: `${themeName}: accent on ${surfaceName} (link text)`,
      foreground: theme.accent,
      background: surface,
      minimum: AA_NORMAL_TEXT,
    },
    {
      label: `${themeName}: border-strong on ${surfaceName} (control border)`,
      foreground: theme.borderStrong,
      background: surface,
      minimum: AA_NON_TEXT,
    },
    {
      label: `${themeName}: focus-ring on ${surfaceName}`,
      foreground: theme.focusRing,
      background: surface,
      minimum: AA_NON_TEXT,
    },
  ]);
}

/**
 * State layers are translucent, so each is composited over the surfaces an
 * interactive element usually sits on before the text on it is measured.
 */
function stateLayerChecks(themeName: string, theme: ThemeColors): Check[] {
  const layers: [string, string][] = [
    ["state-hover", theme.stateHover],
    ["state-pressed", theme.statePressed],
    ["state-selected", theme.stateSelected],
  ];
  const under: [string, string][] = [
    ["bg", theme.bg],
    ["surface", theme.surface],
    ["surface-raised", theme.surfaceRaised],
    ["surface-overlay", theme.surfaceOverlay],
  ];
  return layers.flatMap(([layerName, layer]) =>
    under.flatMap(([surfaceName, surface]) => {
      const painted = composite(layer, surface);
      const checks: Check[] = [
        {
          label: `${themeName}: fg on ${layerName} over ${surfaceName}`,
          foreground: theme.fg,
          background: painted,
          minimum: AA_NORMAL_TEXT,
        },
      ];
      // Secondary text sits in hovered and selected rows; a press lasts 80ms.
      if (layerName !== "state-pressed") {
        checks.push({
          label: `${themeName}: fg-muted on ${layerName} over ${surfaceName}`,
          foreground: theme.fgMuted,
          background: painted,
          minimum: AA_NORMAL_TEXT,
        });
      }
      return checks;
    }),
  );
}

/**
 * Dividers (`line`) and rings (`border`) on the surfaces lists, menus and
 * dialogs are drawn on. In dark mode both are translucent, so the painted
 * color is the layer composited over that surface.
 */
function dividerChecks(themeName: string, theme: ThemeColors): Check[] {
  const under: [string, string][] = [
    ["surface", theme.surface],
    ["surface-raised", theme.surfaceRaised],
    ["surface-overlay", theme.surfaceOverlay],
  ];
  const hairlines: [string, string][] = [
    ["line", theme.line],
    ["border", theme.border],
  ];
  return hairlines.flatMap(([name, color]) =>
    under.map(([surfaceName, surface]) => ({
      label: `${themeName}: ${name} on ${surfaceName} (divider, visible)`,
      foreground: composite(color, surface),
      background: surface,
      minimum: DIVIDER_VISIBLE,
    })),
  );
}

/**
 * A hover or press must show on the control that has it. Controls with
 * their own opaque fill (a secondary Button) lay the layer over that fill
 * (`layer-hover` in packages/ui/src/styles.css) instead of replacing it,
 * so the step is measured over each surface and the label check above
 * covers the composed fill.
 */
function stateStepChecks(themeName: string, theme: ThemeColors): Check[] {
  const under: [string, string][] = [
    ["bg", theme.bg],
    ["surface", theme.surface],
    ["surface-raised", theme.surfaceRaised],
    ["surface-overlay", theme.surfaceOverlay],
  ];
  return (
    [
      ["state-hover", theme.stateHover],
      ["state-pressed", theme.statePressed],
    ] as [string, string][]
  ).flatMap(([layerName, layer]) =>
    under.map(([surfaceName, surface]) => ({
      label: `${themeName}: ${layerName} over ${surfaceName} against ${surfaceName} (visible step)`,
      foreground: composite(layer, surface),
      background: surface,
      minimum: STATE_STEP_VISIBLE,
    })),
  );
}

function categoryChecks(themeName: string, theme: ThemeColors): Check[] {
  return CATEGORY_ORDER.flatMap((name) => {
    const category = theme.category[name];
    return [
      {
        label: `${themeName}: category ${name} fg on bg (icon, non-text)`,
        foreground: category.fg,
        background: theme.bg,
        minimum: AA_NON_TEXT,
      },
      {
        label: `${themeName}: category ${name} fg on surface (icon, non-text)`,
        foreground: category.fg,
        background: theme.surface,
        minimum: AA_NON_TEXT,
      },
      {
        label: `${themeName}: category ${name} fg on surface (as text/link)`,
        foreground: category.fg,
        background: theme.surface,
        minimum: AA_NORMAL_TEXT,
      },
      {
        label: `${themeName}: category ${name} soft-fg on soft (text on tint)`,
        foreground: category.softFg,
        background: category.soft,
        minimum: AA_NORMAL_TEXT,
      },
    ];
  });
}

/** Semantic colors are used as text on any surface and as soft badges. */
function semanticChecks(themeName: string, theme: ThemeColors): Check[] {
  return SEMANTIC_ORDER.flatMap((name) => {
    const color = theme.category[tokens.semantic[name]];
    return [
      ...surfaces(theme).map(([surfaceName, surface]) => ({
        label: `${themeName}: ${name} on ${surfaceName} (text)`,
        foreground: color.fg,
        background: surface,
        minimum: AA_NORMAL_TEXT,
      })),
      {
        label: `${themeName}: ${name}-soft-fg on ${name}-soft (badge)`,
        foreground: color.softFg,
        background: color.soft,
        minimum: AA_NORMAL_TEXT,
      },
    ];
  });
}

function statusChecks(themeName: string, theme: ThemeColors): Check[] {
  return STATUS_ORDER.flatMap((name) => {
    const status = theme.status[name];
    return [
      {
        label: `${themeName}: status ${name} indicator on bg`,
        foreground: status.indicator,
        background: theme.bg,
        minimum: AA_NON_TEXT,
      },
      {
        label: `${themeName}: status ${name} indicator on surface`,
        foreground: status.indicator,
        background: theme.surface,
        minimum: AA_NON_TEXT,
      },
      {
        label: `${themeName}: status ${name} fg text on surface`,
        foreground: status.fg,
        background: theme.surface,
        minimum: AA_NORMAL_TEXT,
      },
    ];
  });
}

function buildChecks(): Check[] {
  return Object.entries(tokens.color).flatMap(([themeName, theme]) => [
    ...baseChecks(themeName, theme),
    ...surfaceChecks(themeName, theme),
    ...stateLayerChecks(themeName, theme),
    ...dividerChecks(themeName, theme),
    ...stateStepChecks(themeName, theme),
    ...categoryChecks(themeName, theme),
    ...semanticChecks(themeName, theme),
    ...statusChecks(themeName, theme),
  ]);
}

const checks = buildChecks();
let failures = 0;

for (const check of checks) {
  const ratio = contrastRatio(check.foreground, check.background);
  if (ratio < check.minimum) {
    failures += 1;
    console.error(
      `FAIL  ${check.label}: ${ratio.toFixed(2)}:1 (needs >= ${check.minimum}:1) [${check.foreground} on ${check.background}]`,
    );
  }
}

if (failures > 0) {
  console.error(`\ncontrast-check: ${failures} of ${checks.length} pairs failed WCAG AA`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`contrast-check: all ${checks.length} pairs meet WCAG AA and the visibility floors`);
