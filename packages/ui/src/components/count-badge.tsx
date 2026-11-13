import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export type CountBadgeTone = "neutral" | "accent" | "danger";

// `neutral` is a translucent layer rather than a surface colour, so the
// count still reads inside a sunken tab track and on an active white pill.
const TONE_CLASS: Record<CountBadgeTone, string> = {
  neutral: "bg-state-pressed text-fg",
  accent: "bg-accent text-accent-fg",
  danger: "bg-danger text-bg",
};

export interface CountBadgeProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  count: number;
  /** Above this the badge reads "99+". */
  max?: number;
  /** `neutral` for a plain tally, `accent` for something waiting on the user, `danger` for overdue. */
  tone?: CountBadgeTone;
  /** A zero count renders nothing unless this is set. */
  showZero?: boolean;
}

/** The small number beside a tab, a navigation item or a section title. */
export function CountBadge({
  count,
  max = 99,
  tone = "neutral",
  showZero = false,
  className,
  ...props
}: CountBadgeProps) {
  if (count <= 0 && !showZero) return null;
  const text = count > max ? `${String(max)}+` : String(Math.max(0, count));
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-caption font-semibold tabular-nums",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {text}
    </span>
  );
}
