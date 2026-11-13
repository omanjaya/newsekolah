import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The typography roles generated from packages/ui-tokens (`text-display`
 * ... `text-caption`). Each sets size, line height, weight, tracking and
 * family at once, so it is its own class group rather than a font size.
 */
export const TYPE_ROLES = [
  "display",
  "title-lg",
  "title",
  "heading",
  "body",
  "body-sm",
  "label",
  "caption",
] as const;

/** Keyframe utilities defined in packages/ui/src/styles.css. */
const ANIMATIONS = [
  "enter",
  "fade-in",
  "fade-out",
  "overlay-in",
  "overlay-out",
  "dialog-in",
  "dialog-out",
  "sheet-in",
  "sheet-out",
  "popover-in",
  "popover-out",
  "rise-in",
  "shimmer",
  "live",
];

/**
 * tailwind-merge only knows Tailwind's built-in scales. Without these
 * entries it would keep both `shadow-card` and `shadow-none`, or treat
 * `text-caption` as a text color and drop it next to `text-fg`.
 * Keep in sync with packages/config/tailwind/preset.css.
 */
const twMerge = extendTailwindMerge<"type-role">({
  extend: {
    theme: {
      shadow: ["0", "1", "2", "3", "card", "float"],
      ease: ["standard", "enter", "exit"],
      animate: ANIMATIONS,
      container: ["narrow", "default", "wide"],
    },
    classGroups: {
      "type-role": [{ text: [...TYPE_ROLES] }],
      duration: [{ duration: ["instant", "fast", "base", "slow"] }],
      z: [{ z: ["sticky", "overlay", "modal", "dropdown", "popover", "toast", "tooltip"] }],
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
