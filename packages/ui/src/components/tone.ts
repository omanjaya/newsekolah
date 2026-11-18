/**
 * The colour vocabulary shared by Badge, IconCircle, Alert, Avatar and the
 * tiles (docs/07-ui-ux.md section 0): one neutral, the accent, the four
 * semantic feedback colours, and the five category hues for topic coding.
 * Every class is written out in full so Tailwind's scanner generates it.
 */

/** The five topic hues: icon-in-soft-circle chips and avatars, not severity. */
export type CategoryTone = "green" | "amber" | "purple" | "blue" | "red";

/** General feedback colours; the `status-*` tokens stay reserved for attendance. */
export type SemanticTone = "success" | "warning" | "danger" | "info";

export type Tone = "neutral" | "accent" | SemanticTone | CategoryTone;

export const CATEGORY_TONES: readonly CategoryTone[] = ["green", "amber", "purple", "blue", "red"];

export interface ToneClasses {
  /** Soft tint with its AA-checked text colour. */
  soft: string;
  /** Solid fill. Semantic and category fills carry `text-bg`, checked at 4.8:1 or more in both themes. */
  solid: string;
  /** Text in the hue with an inset 1px ring of the same colour. */
  outline: string;
  /** A small solid mark (leading dot, live indicator). */
  dot: string;
  /** Soft circle behind a line icon drawn in the full hue (non-text, 3:1 or more). */
  icon: string;
  /** Muted text on top of the soft tint (descriptions inside a tinted surface). */
  softMuted: string;
}

export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  // The neutral fill is the translucent `neutral-soft` token rather than a
  // surface colour: a sunken fill vanishes on the page background in dark
  // mode and reads as a hole in a card, while a tint of the text colour
  // shows on every surface in both themes. Its text is `neutral-soft-fg`
  // (the text colour at 70%) rather than `fg-muted`: about as quiet in the
  // light theme, but it keeps 5.3:1 or more on every surface of both
  // themes, where `fg-muted` drops to 4.25:1 on a dark raised surface (a
  // menu, a popover). The token contrast check measures both over every
  // surface; tone.test.ts does too.
  neutral: {
    soft: "bg-neutral-soft text-neutral-soft-fg",
    solid: "bg-fg text-bg",
    outline: "text-fg-muted ring-border-strong",
    dot: "bg-fg-muted",
    icon: "bg-neutral-soft text-fg-muted",
    softMuted: "text-fg-muted",
  },
  accent: {
    soft: "bg-accent-soft text-accent-soft-fg",
    solid: "bg-accent text-accent-fg",
    outline: "text-accent ring-accent",
    dot: "bg-accent",
    icon: "bg-accent-soft text-accent",
    softMuted: "text-accent-soft-fg-muted",
  },
  success: {
    soft: "bg-success-soft text-success-soft-fg",
    solid: "bg-success text-bg",
    outline: "text-success ring-success",
    dot: "bg-success",
    icon: "bg-success-soft text-success",
    softMuted: "text-success-soft-fg/80",
  },
  warning: {
    soft: "bg-warning-soft text-warning-soft-fg",
    solid: "bg-warning text-bg",
    outline: "text-warning ring-warning",
    dot: "bg-warning",
    icon: "bg-warning-soft text-warning",
    softMuted: "text-warning-soft-fg/80",
  },
  danger: {
    soft: "bg-danger-soft text-danger-soft-fg",
    solid: "bg-danger text-bg",
    outline: "text-danger ring-danger",
    dot: "bg-danger",
    icon: "bg-danger-soft text-danger",
    softMuted: "text-danger-soft-fg/80",
  },
  info: {
    soft: "bg-info-soft text-info-soft-fg",
    solid: "bg-info text-bg",
    outline: "text-info ring-info",
    dot: "bg-info",
    icon: "bg-info-soft text-info",
    softMuted: "text-info-soft-fg/80",
  },
  green: {
    soft: "bg-category-green-soft text-category-green-soft-fg",
    solid: "bg-category-green text-bg",
    outline: "text-category-green ring-category-green",
    dot: "bg-category-green",
    icon: "bg-category-green-soft text-category-green",
    softMuted: "text-category-green-soft-fg/80",
  },
  amber: {
    soft: "bg-category-amber-soft text-category-amber-soft-fg",
    solid: "bg-category-amber text-bg",
    outline: "text-category-amber ring-category-amber",
    dot: "bg-category-amber",
    icon: "bg-category-amber-soft text-category-amber",
    softMuted: "text-category-amber-soft-fg/80",
  },
  purple: {
    soft: "bg-category-purple-soft text-category-purple-soft-fg",
    solid: "bg-category-purple text-bg",
    outline: "text-category-purple ring-category-purple",
    dot: "bg-category-purple",
    icon: "bg-category-purple-soft text-category-purple",
    softMuted: "text-category-purple-soft-fg/80",
  },
  blue: {
    soft: "bg-category-blue-soft text-category-blue-soft-fg",
    solid: "bg-category-blue text-bg",
    outline: "text-category-blue ring-category-blue",
    dot: "bg-category-blue",
    icon: "bg-category-blue-soft text-category-blue",
    softMuted: "text-category-blue-soft-fg/80",
  },
  red: {
    soft: "bg-category-red-soft text-category-red-soft-fg",
    solid: "bg-category-red text-bg",
    outline: "text-category-red ring-category-red",
    dot: "bg-category-red",
    icon: "bg-category-red-soft text-category-red",
    softMuted: "text-category-red-soft-fg/80",
  },
};
