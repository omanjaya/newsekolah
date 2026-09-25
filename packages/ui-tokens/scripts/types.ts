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
  fg: string;
  fgMuted: string;
  /** Card/control ring (subtle, ~1px), distinct from `line`. */
  border: string;
  /** Divider hairline (table rows, tab underline track, list separators). */
  line: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  accentSoftFg: string;
  /** Hover/pressed shade for solid accent surfaces (buttons). */
  accentStrong: string;
  category: Record<CategoryName, CategoryColor>;
  status: Record<StatusName, StatusColor>;
}

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
  shadow: Record<string, string>;
  zIndex: Record<string, number>;
  motion: {
    duration: Record<string, number>;
    easing: string;
  };
}
