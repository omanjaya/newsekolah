import { Children, forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { TONE_CLASSES, type Tone } from "./tone.js";

export type BadgeTone = Tone;
export type BadgeAppearance = "soft" | "solid" | "outline";
export type BadgeSize = "sm" | "md";

/** The colours `variant` accepted before `tone`; each maps to the tone of the same name. */
type LegacyBadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

// Both sizes are pills on the caption role at 600; the inset ring of
// `outline` keeps all three appearances exactly the same size. The height
// is a minimum: a text pill is exactly 24 or 20px, while a pill holding a
// control (a remove button) grows around it instead of letting it spill.
const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: "min-h-5 gap-1 px-2",
  md: "min-h-6 gap-1.5 px-2.5",
};

export interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  /** `neutral` (default), `accent`, the semantic tones, or a category hue for topic coding. */
  tone?: BadgeTone;
  /** `soft` tint (default), `solid` fill for the one chip that must stand out, `outline` for a quiet label. */
  appearance?: BadgeAppearance;
  /** `md` 24px (default) or `sm` 20px for dense rows and inline use. */
  size?: BadgeSize;
  /** A leading dot in the tone's full colour. */
  dot?: boolean;
  /** Colours the dot instead of the tone (StatusBadge passes an attendance status token). */
  dotClassName?: string;
  /** The first version's name for `tone` (six colours); still honoured, `tone` wins when both are set. */
  variant?: LegacyBadgeVariant | null;
}

/** Classes for a badge, for a non-span element that has to look like one (a link chip). */
export function badgeClassName({
  tone = "neutral",
  appearance = "soft",
  size = "md",
}: Pick<BadgeProps, "tone" | "appearance" | "size"> = {}): string {
  const colors = TONE_CLASSES[tone];
  return cn(
    "inline-flex max-w-full shrink-0 items-center rounded-full text-caption font-semibold whitespace-nowrap",
    SIZE_CLASS[size],
    appearance === "solid" && colors.solid,
    appearance === "soft" && colors.soft,
    appearance === "outline" && cn("bg-transparent ring-1 ring-inset", colors.outline),
  );
}

/**
 * Puts each run of text in a span that can shrink and end in an ellipsis.
 * Bare text in a flex container is an anonymous item no class can reach,
 * so a long label would spill out of a pill capped by `max-w-full`.
 * Elements (an icon, a button) stay items of their own.
 */
function truncatableText(children: ReactNode): ReactNode[] {
  const items: ReactNode[] = [];
  let run = "";
  const flush = () => {
    if (run === "") return;
    items.push(
      <span key={`text-${String(items.length)}`} className="min-w-0 truncate">
        {run}
      </span>,
    );
    run = "";
  };
  for (const child of Children.toArray(children)) {
    if (typeof child === "string" || typeof child === "number") {
      run += String(child);
    } else {
      flush();
      items.push(child);
    }
  }
  flush();
  return items;
}

/** A status or label pill (docs/07-ui-ux.md): one shape for every chip in the product. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    className,
    tone,
    appearance = "soft",
    size = "md",
    dot,
    dotClassName,
    variant,
    children,
    ...props
  },
  ref,
) {
  const resolvedTone: BadgeTone = tone ?? variant ?? "neutral";
  const dotColor =
    dotClassName ?? (appearance === "solid" ? "bg-current" : TONE_CLASSES[resolvedTone].dot);
  return (
    <span
      ref={ref}
      data-slot="badge"
      className={cn(badgeClassName({ tone: resolvedTone, appearance, size }), className)}
      {...props}
    >
      {dot && (
        <span className={cn("size-1.5 shrink-0 rounded-full", dotColor)} aria-hidden="true" />
      )}
      {truncatableText(children)}
    </span>
  );
});
