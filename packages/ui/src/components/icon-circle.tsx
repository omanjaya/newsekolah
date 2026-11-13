import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

import { TONE_CLASSES, type Tone } from "./tone.js";

export type IconCircleSize = "sm" | "md" | "lg" | "xl";

// Circle and glyph grow together on a 4px rhythm; the glyph is half the circle.
const SIZE_CLASS: Record<IconCircleSize, string> = {
  sm: "size-8 [&>svg]:size-4",
  md: "size-10 [&>svg]:size-5",
  lg: "size-12 [&>svg]:size-6",
  xl: "size-14 [&>svg]:size-7",
};

export interface IconCircleProps extends ComponentPropsWithoutRef<"span"> {
  /** Category hues code a topic, semantic tones a state, `neutral` stays quiet. */
  tone?: Tone;
  /** `sm` 32, `md` 40, `lg` 48, `xl` 56. */
  size?: IconCircleSize;
}

/**
 * A line icon in a soft tinted circle, the artboard's way of marking a
 * topic (stat tiles, list rows, empty and error states). Decorative: it is
 * hidden from assistive technology, so the text next to it carries the meaning.
 */
export function IconCircle({
  tone = "neutral",
  size = "md",
  className,
  children,
  ...props
}: IconCircleProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        TONE_CLASSES[tone].icon,
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
