export interface StatusColor {
  indicator: string;
  fg: string;
}

export type StatusName = "present" | "sick" | "excused" | "dispensation" | "absent" | "late";

/** A hue used for icon chips (decorative, topic-coded) and, via `semantic`, for status feedback. */
export interface CategoryColor {
  /** Icon/link color: reads on `bg` and `surface` at normal-text AA (>= 4.5:1). */
  fg: string;
  /** Low-saturation tint, used as a chip/badge background behind `fg`-colored icons. */
  soft: string;
  /** Darker text-safe variant of `fg`, for text or fine icons placed on `soft` (>= 4.5:1 on `soft`). */
  softFg: string;
}

export type CategoryName = "green" | "amber" | "purple" | "blue" | "red";

export type SemanticName = "success" | "warning" | "danger" | "info";

export interface ThemeColors {
  bg: string;
  surface: string;
  /** Popovers, menus and sheets: one step above `surface` (lighter in dark mode). */
  surfaceRaised: string;
  /** Recessed fills inside a surface: input cells, tab tracks. */
  surfaceSunken: string;
  /** Dialogs: the highest opaque surface. */
  surfaceOverlay: string;
  /** Backdrop behind dialogs and sheets. Translucent (rgba). */
  scrim: string;
  fg: string;
  fgMuted: string;
  /** Card/control ring (subtle, ~1px), distinct from `line`. */
  border: string;
  /** Form control border: >= 3:1 against every opaque surface (WCAG 1.4.11). */
  borderStrong: string;
  /** Divider hairline (table rows, tab underline track, list separators). */
  line: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  accentSoftFg: string;
  /** Hover/pressed shade for solid accent surfaces (buttons). */
  accentStrong: string;
  /** Neutral state layers (rgba), laid over whatever surface an element sits on. */
  stateHover: string;
  statePressed: string;
  /** Accent-tinted layer for a chosen row, item or option. */
  stateSelected: string;
  /** Keyboard focus outline: >= 3:1 against every opaque surface. */
  focusRing: string;
  /** Skeleton placeholder fill and its moving highlight (both rgba). */
  skeleton: string;
  skeletonShine: string;
  category: Record<CategoryName, CategoryColor>;
  status: Record<StatusName, StatusColor>;
}

/** One typography role: a complete text style applied by a single utility class. */
export interface TypeRole {
  /** `heading` resolves to Manrope (`--font-heading`), `sans` to Plus Jakarta Sans. */
  family: "heading" | "sans";
  /** px */
  size: number;
  /** px */
  lineHeight: number;
  weight: number;
  /** CSS letter-spacing, e.g. "-0.02em" or "0". */
  tracking: string;
  /** Smaller step used below the `sm` breakpoint (640px). */
  compact?: { size: number; lineHeight: number };
}

export type TypeRoleName =
  "display" | "title-lg" | "title" | "heading" | "body" | "body-sm" | "label" | "caption";

export type ElevationLevel = "0" | "1" | "2" | "3";

export interface TokensSource {
  color: {
    light: ThemeColors;
    dark: ThemeColors;
  };
  /** Maps a semantic feedback name onto one of `color.*.category`'s hues. */
  semantic: Record<SemanticName, CategoryName>;
  statusNames: Record<StatusName, string>;
  spacing: Record<string, number>;
  radius: Record<string, number>;
  type: Record<string, number>;
  typeRoles: Record<TypeRoleName, TypeRole>;
  shadow: {
    /** Elevation levels per theme; dark shadows are deeper because a light-on-dark shadow is invisible. */
    levels: Record<"light" | "dark", Record<ElevationLevel, string>>;
    /** Older names kept as aliases onto a level. */
    aliases: Record<string, ElevationLevel>;
  };
  zIndex: Record<string, number>;
  /** Page container max widths, px. */
  container: Record<string, number>;
  motion: {
    /** ms */
    duration: Record<"instant" | "fast" | "base" | "slow", number>;
    easing: Record<"standard" | "enter" | "exit", string>;
    /** px */
    distance: Record<"rise" | "shift", number>;
    scale: Record<"dialog" | "press", number>;
    /** `step` ms between staggered items, at most `maxSteps` steps. */
    stagger: { step: number; maxSteps: number };
    /** ms, for the only looping animations allowed (skeleton shimmer, live dot). */
    loop: Record<"shimmer" | "pulse", number>;
  };
}
