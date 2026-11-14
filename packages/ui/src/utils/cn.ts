import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The typography roles generated from packages/ui-tokens (`text-display`
 * ... `text-caption`). Each sets size, line height, weight, tracking and
 * family at once, so it is its own class group rather than a font size.
 */
export const TYPE_ROLES = [
  "kiosk-display",
  "kiosk-title",
  "display",
  "title-lg",
  "title",
  "heading",
  "body-lg",
  "body",
  "body-sm",
  "label",
  "caption",
] as const;

/** Keyframe utilities defined in packages/ui/src/styles.css. */
export const ANIMATIONS = [
  "enter",
  "fade-in",
  "fade-out",
  "overlay-in",
  "overlay-out",
  "sheet-overlay-out",
  "dialog-in",
  "dialog-out",
  "sheet-in",
  "sheet-out",
  "drawer-in",
  "drawer-out",
  "popover-in",
  "popover-out",
  "rise-in",
  "live",
];

/** Named token scales from packages/ui-tokens, checked against dist/tokens.ts by cn.test.ts. */
export const SHADOWS = ["0", "1", "2", "3", "card", "float"] as const;
export const EASINGS = ["standard", "enter", "exit", "sheet"] as const;
export const CONTAINERS = ["narrow", "default", "wide"] as const;
export const DURATIONS = ["instant", "fast", "base", "slow"] as const;
export const Z_LAYERS = [
  "sticky",
  "overlay",
  "modal",
  "dropdown",
  "popover",
  "toast",
  "tooltip",
] as const;

/**
 * tailwind-merge only knows Tailwind's built-in scales. Without these
 * entries it would keep both `shadow-card` and `shadow-none`, or treat
 * `text-caption` as a text color and drop it next to `text-fg`.
 * Keep in sync with packages/config/tailwind/preset.css; cn.test.ts fails
 * when a token is added to tokens.json and not here.
 */
const twMerge = extendTailwindMerge<"type-role">({
  extend: {
    theme: {
      shadow: [...SHADOWS],
      ease: [...EASINGS],
      animate: ANIMATIONS,
      container: [...CONTAINERS],
    },
    classGroups: {
      "type-role": [{ text: [...TYPE_ROLES] }],
      duration: [{ duration: [...DURATIONS] }],
      z: [{ z: [...Z_LAYERS] }],
    },
    conflictingClassGroups: {
      // A role replaces every part of the text style it sets...
      "type-role": ["font-size", "leading", "font-weight", "tracking", "font-family"],
      // ...and a plain size after it replaces the role.
      "font-size": ["type-role"],
    },
  },
});

/** Merges class lists, letting later Tailwind classes win over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
