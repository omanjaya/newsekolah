// Asserts the token palette meets WCAG 2.x AA before it ships: 4.5:1 for
// text/background pairs, 3:1 for status/category colors used as non-text
// indicators against a surface. Run via `pnpm test` (see package.json) and
// standalone via `pnpm contrast-check`. See docs/07-ui-ux.md ("Hijau Segar")
// for the source palette; wcag-contrast.js implements the contrast formula.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CategoryName, StatusName, TokensSource } from "./types.js";
import { AA_NON_TEXT, AA_NORMAL_TEXT, contrastRatio } from "./wcag-contrast.js";

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

const STATUS_ORDER: StatusName[] = ["present", "sick", "excused", "dispensation", "absent", "late"];
const CATEGORY_ORDER: CategoryName[] = ["green", "amber", "purple", "blue", "red"];

function buildChecks(): Check[] {
  const checks: Check[] = [];
  for (const [themeName, theme] of Object.entries(tokens.color)) {
    checks.push(
      {
        label: `${themeName}: fg on bg`,
        foreground: theme.fg,
        background: theme.bg,
        minimum: AA_NORMAL_TEXT,
      },
      {
        label: `${themeName}: fg on surface`,
        foreground: theme.fg,
        background: theme.surface,
        minimum: AA_NORMAL_TEXT,
      },
      {
        label: `${themeName}: fg-muted on bg`,
        foreground: theme.fgMuted,
        background: theme.bg,
        minimum: AA_NORMAL_TEXT,
      },
      {
        label: `${themeName}: fg-muted on surface`,
        foreground: theme.fgMuted,
        background: theme.surface,
        minimum: AA_NORMAL_TEXT,
      },
      {
        label: `${themeName}: accent-fg on accent`,
        foreground: theme.accentFg,
        background: theme.accent,
        minimum: AA_NORMAL_TEXT,
      },
      {
        label: `${themeName}: accent on bg (icon/link, non-text)`,
        foreground: theme.accent,
        background: theme.bg,
        minimum: AA_NON_TEXT,
      },
      {
        label: `${themeName}: accent on surface (icon/link, non-text)`,
        foreground: theme.accent,
        background: theme.surface,
        minimum: AA_NON_TEXT,
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
    );
    for (const name of CATEGORY_ORDER) {
      const category = theme.category[name];
      checks.push(
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
      );
    }
    for (const name of STATUS_ORDER) {
      const status = theme.status[name];
      checks.push(
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
      );
    }
  }
  return checks;
}

const checks = buildChecks();
let failures = 0;

for (const check of checks) {
  const ratio = contrastRatio(check.foreground, check.background);
  const pass = ratio >= check.minimum;
  if (!pass) {
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
console.log(`contrast-check: all ${checks.length} pairs meet WCAG AA`);
