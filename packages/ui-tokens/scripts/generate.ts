import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CategoryColor,
  CategoryName,
  SemanticName,
  StatusName,
  ThemeColors,
  TokensSource,
  TypeRoleName,
} from "./types.js";

// Turns tokens.json into the three generated files under dist/. Pure
// functions over the parsed source, so the tests can check the output
// without writing anything. dist/ is gitignored and rebuilt by
// `pnpm --filter @newsekolah/ui-tokens build` (run before `pnpm dev`).

const here = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(here, "..");
const tokens = JSON.parse(
  readFileSync(resolve(packageRoot, "tokens.json"), "utf-8"),
) as TokensSource;

const STATUS_ORDER: StatusName[] = ["present", "sick", "excused", "dispensation", "absent", "late"];
const CATEGORY_ORDER: CategoryName[] = ["green", "amber", "purple", "blue", "red"];
const SEMANTIC_ORDER: SemanticName[] = ["success", "warning", "danger", "info"];
const TYPE_ROLE_ORDER: TypeRoleName[] = [
  "display",
  "title-lg",
  "title",
  "heading",
  "body",
  "body-sm",
  "label",
  "caption",
];

/** Flat theme keys, in output order, with the CSS custom property each becomes. */
const THEME_KEYS: [keyof ThemeColors, string][] = [
  ["bg", "bg"],
  ["surface", "surface"],
  ["surfaceRaised", "surface-raised"],
  ["surfaceSunken", "surface-sunken"],
  ["surfaceOverlay", "surface-overlay"],
  ["scrim", "scrim"],
  ["fg", "fg"],
  ["fgMuted", "fg-muted"],
  ["border", "border"],
  ["borderStrong", "border-strong"],
  ["line", "line"],
  ["accent", "accent"],
  ["accentFg", "accent-fg"],
  ["accentSoft", "accent-soft"],
  ["accentSoftFg", "accent-soft-fg"],
  ["accentStrong", "accent-strong"],
  ["stateHover", "state-hover"],
  ["statePressed", "state-pressed"],
  ["stateSelected", "state-selected"],
  ["focusRing", "focus-ring"],
  ["skeleton", "skeleton"],
  ["skeletonShine", "skeleton-shine"],
];

/** Semantic feedback colors resolved to real values (not aliases) for one theme. */
function semanticColors(theme: ThemeColors): Record<SemanticName, CategoryColor> {
  return Object.fromEntries(
    SEMANTIC_ORDER.map((name) => [name, theme.category[tokens.semantic[name]]]),
  ) as Record<SemanticName, CategoryColor>;
}

function colorVars(theme: ThemeColors, indent: string): string[] {
  const lines = THEME_KEYS.map(
    ([key, name]) => `${indent}--color-${name}: ${theme[key] as string};`,
  );
  for (const name of CATEGORY_ORDER) {
    const category = theme.category[name];
    lines.push(`${indent}--color-category-${name}: ${category.fg};`);
    lines.push(`${indent}--color-category-${name}-soft: ${category.soft};`);
    lines.push(`${indent}--color-category-${name}-soft-fg: ${category.softFg};`);
  }
  const semantic = semanticColors(theme);
  for (const name of SEMANTIC_ORDER) {
    lines.push(`${indent}--color-${name}: ${semantic[name].fg};`);
    lines.push(`${indent}--color-${name}-soft: ${semantic[name].soft};`);
    lines.push(`${indent}--color-${name}-soft-fg: ${semantic[name].softFg};`);
  }
  for (const name of STATUS_ORDER) {
    const status = theme.status[name];
    lines.push(`${indent}--color-status-${name}: ${status.indicator};`);
    lines.push(`${indent}--color-status-${name}-fg: ${status.fg};`);
  }
  return lines;
}

/**
 * Elevation levels plus the `card`/`float` aliases. The aliases are
 * repeated in every theme block, not only on `:root`: a `var()` resolves
 * where it is declared, so an alias declared once would keep the light
 * shadow inside a nested `[data-theme="dark"]` scope.
 */
function shadowVars(themeName: "light" | "dark", indent: string): string[] {
  const levels = Object.entries(tokens.shadow.levels[themeName]).map(
    ([level, value]) => `${indent}--shadow-${level}: ${value};`,
  );
  const aliases = Object.entries(tokens.shadow.aliases).map(
    ([alias, level]) => `${indent}--shadow-${alias}: var(--shadow-${level});`,
  );
  return [...levels, ...aliases];
}

/** Everything a dark theme overrides: colors and elevation. */
function themeVars(themeName: "light" | "dark", indent: string): string {
  return [...colorVars(tokens.color[themeName], indent), ...shadowVars(themeName, indent)].join(
    "\n",
  );
}

function entries(source: Record<string, number>, prefix: string, unit = "px"): string[] {
  return Object.entries(source).map(([key, value]) => `  --${prefix}-${key}: ${value}${unit};`);
}

function typeRoleVars(): string[] {
  return TYPE_ROLE_ORDER.flatMap((name) => {
    const role = tokens.typeRoles[name];
    return [
      `  --type-${name}-size: ${role.size}px;`,
      `  --type-${name}-line-height: ${role.lineHeight}px;`,
      `  --type-${name}-weight: ${role.weight};`,
      `  --type-${name}-tracking: ${role.tracking};`,
    ];
  });
}

/** Roles with a `compact` step shrink below the `sm` breakpoint (40rem = 640px). */
function compactTypeRoleVars(): string[] {
  return TYPE_ROLE_ORDER.flatMap((name) => {
    const compact = tokens.typeRoles[name].compact;
    if (!compact) return [];
    return [
      `    --type-${name}-size: ${compact.size}px;`,
      `    --type-${name}-line-height: ${compact.lineHeight}px;`,
    ];
  });
}

function motionVars(): string[] {
  const { motion } = tokens;
  return [
    ...entries(motion.duration, "duration", "ms"),
    ...Object.entries(motion.easing).map(([key, value]) => `  --ease-${key}: ${value};`),
    `  --motion-rise: ${motion.distance.rise}px;`,
    `  --motion-shift: ${motion.distance.shift}px;`,
    `  --motion-scale-dialog: ${motion.scale.dialog};`,
    `  --motion-scale-press: ${motion.scale.press};`,
    `  --motion-stagger-step: ${motion.stagger.step}ms;`,
    // The last index that still gets its own delay: items past it enter together.
    `  --motion-stagger-max: ${motion.stagger.maxSteps - 1};`,
    `  --motion-loop-shimmer: ${motion.loop.shimmer}ms;`,
    `  --motion-loop-pulse: ${motion.loop.pulse}ms;`,
  ];
}

/**
 * Reduced motion keeps short opacity fades and drops everything that moves:
 * no rise, shift or scale, and nothing slower than `fast`.
 */
function reducedMotionVars(): string[] {
  const { duration } = tokens.motion;
  const capped = Object.entries(duration)
    .filter(([, value]) => value > duration.fast)
    .map(([key]) => `    --duration-${key}: ${duration.fast}ms;`);
  return [
    ...capped,
    "    --motion-rise: 0px;",
    "    --motion-shift: 0px;",
    "    --motion-scale-dialog: 1;",
    "    --motion-scale-press: 1;",
    "    --motion-stagger-step: 0ms;",
  ];
}

export function buildCss(): string {
  const zIndex = Object.entries(tokens.zIndex).map(([key, value]) => `  --z-${key}: ${value};`);

  return `/* Generated by packages/ui-tokens/scripts/build-tokens.ts. Do not edit by hand. */

:root {
${themeVars("light", "  ")}
${entries(tokens.spacing, "space").join("\n")}
${entries(tokens.radius, "radius").join("\n")}
${entries(tokens.type, "text").join("\n")}
${typeRoleVars().join("\n")}
${zIndex.join("\n")}
${entries(tokens.container, "container").join("\n")}
${motionVars().join("\n")}
}

@media (width < 40rem) {
  :root {
${compactTypeRoleVars().join("\n")}
  }
}

[data-theme="dark"] {
${themeVars("dark", "  ")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${themeVars("dark", "    ")}
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
${reducedMotionVars().join("\n")}
  }
}
`;
}

/**
 * Roles whose text can run to two lines and should break evenly when it
 * does. Not `heading`: a short card title next to a link would be split
 * into two stubby lines instead of keeping its first line full.
 */
const BALANCED_ROLES = new Set<TypeRoleName>(["display", "title"]);

/**
 * Tailwind v4 `@utility` rules, one per role, so `text-display` sets the
 * whole style in one class. The font family names Tailwind's own theme
 * variables (`--font-heading`, `--font-sans`, defined in the preset) rather
 * than a token variable, which keeps Tailwind aware that they are used.
 * `text-wrap-style` (not the `text-wrap` shorthand) balances a wrapped
 * title without overriding `truncate`'s no-wrap mode.
 */
export function buildTypeRolesCss(): string {
  const rules = TYPE_ROLE_ORDER.map((name) => {
    const role = tokens.typeRoles[name];
    const balance = BALANCED_ROLES.has(name) ? "\n  text-wrap-style: balance;" : "";
    return `@utility text-${name} {
  font-family: var(--font-${role.family});
  font-size: var(--type-${name}-size);
  line-height: var(--type-${name}-line-height);
  font-weight: var(--type-${name}-weight);
  letter-spacing: var(--type-${name}-tracking);${balance}
}`;
  });
  return `/* Generated by packages/ui-tokens/scripts/build-tokens.ts. Do not edit by hand. */
/* Tailwind v4 typography role utilities; values live in tokens.css. */

${rules.join("\n\n")}
`;
}

function literal(value: unknown, indent: string): string {
  return JSON.stringify(value, null, 2).replace(/\n/g, `\n${indent}`);
}

function themeLiteral(theme: ThemeColors): string {
  return literal({ ...theme, semantic: semanticColors(theme) }, "  ");
}

export function buildTs(): string {
  const { light, dark } = tokens.color;
  const flatKeys = THEME_KEYS.map(([key]) => `  ${key}: string;`).join("\n");
  return `// Generated by packages/ui-tokens/scripts/build-tokens.ts. Do not edit by hand.
// Typed token object for NativeWind / React Native, mirroring dist/tokens.css.

export type StatusName = "present" | "sick" | "excused" | "dispensation" | "absent" | "late";
export type CategoryName = "green" | "amber" | "purple" | "blue" | "red";
export type SemanticName = "success" | "warning" | "danger" | "info";
export type TypeRoleName = ${TYPE_ROLE_ORDER.map((name) => `"${name}"`).join(" | ")};

export interface StatusColor {
  indicator: string;
  fg: string;
}

export interface CategoryColor {
  fg: string;
  soft: string;
  softFg: string;
}

export interface ThemeColors {
${flatKeys}
  category: Record<CategoryName, CategoryColor>;
  status: Record<StatusName, StatusColor>;
  semantic: Record<SemanticName, CategoryColor>;
}

export interface TypeRole {
  family: "heading" | "sans";
  size: number;
  lineHeight: number;
  weight: number;
  tracking: string;
  compact?: { size: number; lineHeight: number };
}

export const statusNames: Record<StatusName, string> = ${literal(tokens.statusNames, "")};

export const semantic: Record<SemanticName, CategoryName> = ${literal(tokens.semantic, "")};

export const colors = {
  light: ${themeLiteral(light)},
  dark: ${themeLiteral(dark)},
} satisfies Record<"light" | "dark", ThemeColors>;

export const spacing = ${literal(tokens.spacing, "")} as const;

export const radius = ${literal(tokens.radius, "")} as const;

export const type = ${literal(tokens.type, "")} as const;

export const typeRoles = ${literal(tokens.typeRoles, "")} satisfies Record<TypeRoleName, TypeRole>;

export const elevation = ${literal(tokens.shadow.levels, "")} as const;

/** \`card\` and \`float\` in the light theme, kept for callers that predate elevation levels. */
export const shadow = {
${Object.entries(tokens.shadow.aliases)
  .map(([alias, level]) => `  ${alias}: ${JSON.stringify(tokens.shadow.levels.light[level])},`)
  .join("\n")}
} as const;

export const zIndex = ${literal(tokens.zIndex, "")} as const;

export const container = ${literal(tokens.container, "")} as const;

export const motion = ${literal(tokens.motion, "")} as const;
`;
}
