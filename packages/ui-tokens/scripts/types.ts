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
  /**
   * Popovers, menus, selects and sheets. They stack above dialogs (z-popover
   * over z-modal), so in dark mode this is the lightest surface.
   */
  surfaceRaised: string;
  /** Recessed fills inside a surface: input cells, tab tracks. Darker than `bg` in dark mode. */
  surfaceSunken: string;
  /** Dialogs: above `surface`, below the popovers and menus opened from them. */
  surfaceOverlay: string;
  /**
   * The band under a table's column headers and its totals row: the sunken
   * tint in light; in dark, where sunken is darker than the page and read
   * as a black slot across a card, the card lifted a step toward `fg`.
   */
  surfaceHeader: string;
  /** Backdrop behind dialogs and sheets. Translucent (rgba). */
  scrim: string;
  fg: string;
  fgMuted: string;
  /**
   * Card/control ring (subtle, ~1px), distinct from `line`. Translucent in
   * dark mode, like `line`, so it keeps the same step on every surface.
   */
  border: string;
  /** Form control border: >= 3:1 against every opaque surface (WCAG 1.4.11). */
  borderStrong: string;
  /**
   * Divider hairline (table rows, tab underline track, list separators).
   * Translucent (fg-based rgba) in dark mode: an opaque dark line tuned for
   * `surface` vanishes on the lighter raised and overlay surfaces.
   */
  line: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  accentSoftFg: string;
  /** Secondary text on `accentSoft` (a hero card's meta line, a tinted card's description). */
  accentSoftFgMuted: string;
  /** Hover/pressed shade for solid accent surfaces (buttons). */
  accentStrong: string;
  /**
   * The neutral soft fill of a Badge, a CountBadge or an IconCircle.
   * Translucent (fg-based rgba), so it shows on every surface in both
   * themes, where an opaque sunken fill vanishes on the dark page.
   */
  neutralSoft: string;
  /** Text on `neutralSoft` (rgba of `fg`): AA on that fill over every surface. */
  neutralSoftFg: string;
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
  /**
   * A printed page drawn on screen (a letterhead or document preview):
   * white paper with dark ink in both themes, because what prints is
   * always white. The same values in light and dark.
   */
  paper: string;
  paperFg: string;
  paperFgMuted: string;
  /** Placeholder text lines and rules on the paper. */
  paperLine: string;
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

/**
 * `kiosk-display` and `kiosk-title` are for wall screens read from across
 * a room (the kiosk clock, a kiosk's headline), never for app pages.
 * `body-lg` is 16/24 body text: a field's text on touch, where iOS zooms
 * into anything smaller.
 */
export type TypeRoleName =
  | "kiosk-display"
  | "kiosk-title"
  | "display"
  | "title-lg"
  | "title"
  | "heading"
  | "body-lg"
  | "body"
  | "body-sm"
  | "label"
  | "caption";

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
    /** `sheet` is for long travel (a full-height sheet), where `enter` front-loads too much. */
    easing: Record<"standard" | "enter" | "exit" | "sheet", string>;
    /** px */
    distance: Record<"rise" | "shift", number>;
    scale: Record<"dialog" | "press", number>;
    /** `step` ms between staggered items, at most `maxSteps` steps. */
    stagger: { step: number; maxSteps: number };
    /** ms, for the only looping animations allowed (skeleton shimmer, live dot). */
    loop: Record<"shimmer" | "pulse", number>;
  };
}
