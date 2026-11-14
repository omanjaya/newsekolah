import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { Badge, type BadgeAppearance, type BadgeTone } from "./badge.js";

export type HeroCardTone = "accent-soft" | "neutral" | "warning";

interface ToneStyle {
  surface: string;
  muted: string;
  chipTone: BadgeTone;
  chipAppearance: BadgeAppearance;
}

const TONE: Record<HeroCardTone, ToneStyle> = {
  "accent-soft": {
    surface: "bg-accent-soft text-accent-soft-fg",
    // The artboard's #2D5C4F (light), checked against the tint.
    muted: "text-accent-soft-fg-muted",
    chipTone: "accent",
    chipAppearance: "solid",
  },
  neutral: {
    surface: "border border-border bg-surface text-fg shadow-1",
    muted: "text-fg-muted",
    chipTone: "neutral",
    chipAppearance: "soft",
  },
  warning: {
    surface: "bg-warning-soft text-warning-soft-fg",
    muted: "text-warning-soft-fg/80",
    chipTone: "warning",
    chipAppearance: "solid",
  },
};

export interface HeroCardProps extends Omit<ComponentPropsWithRef<"section">, "title"> {
  /** What this card is about, in sentence case ("Pelajaran berikutnya"). */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Muted details under the title: time, place, person. */
  meta?: ReactNode;
  /** A short status pill on the right of the eyebrow ("12 menit lagi"). */
  chip?: ReactNode;
  /** Adds the 2s "in progress" pulse to the chip's dot. */
  live?: boolean;
  /** The one primary action. */
  action?: ReactNode;
  /** A quieter companion to `action`, such as a text link. */
  secondaryAction?: ReactNode;
  /** Extra content between the meta line and the actions (a progress bar, a short list). */
  children?: ReactNode;
  /** `accent-soft` (default) for "now", `neutral` for a calm state, `warning` for something overdue. */
  tone?: HeroCardTone;
  titleAs?: "h1" | "h2" | "h3";
}

/**
 * The "right now" card that opens a home screen (artboard: radius 24,
 * 18/20 padding, 13/600 eyebrow, the title on the display role, muted
 * meta), with one primary action.
 */
export function HeroCard({
  eyebrow,
  title,
  meta,
  chip,
  live = false,
  action,
  secondaryAction,
  children,
  tone = "accent-soft",
  titleAs: Title = "h2",
  className,
  ...props
}: HeroCardProps): ReactElement {
  const style = TONE[tone];
  const hasActions = Boolean(action) || Boolean(secondaryAction);
  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-xl px-5 py-4.5 md:px-6 md:py-5",
        style.surface,
        className,
      )}
      {...props}
    >
      {(Boolean(eyebrow) || Boolean(chip)) && (
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {eyebrow && <p className={cn("text-label", style.muted)}>{eyebrow}</p>}
          {chip && (
            <Badge
              tone={style.chipTone}
              appearance={style.chipAppearance}
              dot={live}
              dotClassName={live ? "bg-current animate-live" : undefined}
              className="ml-auto font-bold"
            >
              {chip}
            </Badge>
          )}
        </div>
      )}
      <Title className="text-display">{title}</Title>
      {meta && <p className={cn("text-body", style.muted)}>{meta}</p>}
      {children}
      {hasActions && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </section>
  );
}
