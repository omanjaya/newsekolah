"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import {
  forwardRef,
  useMemo,
  type ComponentPropsWithRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

import {
  CardContextProvider,
  useCardContext,
  type CardPadding,
  type CardTone,
} from "./card-context.js";

export type { CardPadding, CardTone };

/*
 * The elevated surface of "Hijau Segar" (docs/07-ui-ux.md): radius 20, a
 * hairline ring standing in for the artboard's `0 0 0 1px #EAE8E1`, and
 * elevation 1. A padded card stacks its children on a fixed rhythm; an
 * unpadded one (the default, and what every existing call site gets) lets
 * CardHeader, CardContent and CardFooter carry the 20px inset.
 */
const cardVariants = cva("rounded-lg border", {
  variants: {
    tone: {
      default: "border-border bg-surface shadow-1",
      sunken: "border-transparent bg-surface-sunken",
      "accent-soft": "border-transparent bg-accent-soft text-accent-soft-fg",
      raised: "border-border bg-surface-raised shadow-2",
    },
    padding: {
      none: "",
      sm: "flex flex-col gap-3 p-4",
      md: "flex flex-col gap-4 p-5",
      lg: "flex flex-col gap-5 p-6",
    },
    interactive: {
      // `motion-press` carries the colour and shadow transitions and the
      // 0.98 press; the focus ring is the global :focus-visible outline,
      // which follows the 20px radius.
      true:
        "cursor-pointer text-left motion-press " +
        "aria-disabled:pointer-events-none aria-disabled:opacity-60",
      false: "",
    },
  },
  compoundVariants: [
    // Elevated tones lift one step; Tailwind's `hover:` only fires on a
    // device that can hover, so a tap never leaves a card stuck raised.
    {
      interactive: true,
      tone: "default",
      className: "hover:shadow-2 hover:border-border-strong/40",
    },
    { interactive: true, tone: "raised", className: "hover:shadow-3" },
    // Flat tones have no shadow to own, so the state layer paints over the tint.
    { interactive: true, tone: "sunken", className: "state-layer" },
    { interactive: true, tone: "accent-soft", className: "state-layer" },
  ],
  defaultVariants: { tone: "default", padding: "none", interactive: false },
});

interface CardBaseProps extends ComponentPropsWithoutRef<"div"> {
  /**
   * The card's own inset: `sm` 16, `md` 20, `lg` 24, stacking children
   * with a 12/16/20 gap. `none` (default) leaves the inset to the sections,
   * or to the content for a flush table or list.
   */
  padding?: CardPadding;
  /** `sunken` for a well inside another surface, `accent-soft` for a "now" card, `raised` for a floating one. */
  tone?: CardTone;
}

/**
 * An `interactive` card must render onto its own `a`, `Link` or `button`
 * through `asChild`: a clickable `div` would show a pointer and a press but
 * stay out of reach of the keyboard, so the types refuse it.
 */
export type CardProps = CardBaseProps &
  (
    | {
        interactive?: false;
        /** Renders the card's styles onto its single child element. */
        asChild?: boolean;
      }
    | {
        /** Hover elevation, press feedback and a pointer, for a card that is one link or button. */
        interactive: true;
        asChild: true;
      }
  );

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, padding = "none", tone = "default", interactive = false, asChild, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "div";
  const context = useMemo(() => ({ padding, tone }), [padding, tone]);
  return (
    <CardContextProvider value={context}>
      <Comp
        ref={ref}
        data-slot="card"
        // Read by styles.css: a List or inline DataList that is a direct
        // child bleeds into this padding to span the card edge to edge.
        data-card-padding={padding}
        className={cn(cardVariants({ tone, padding, interactive }), className)}
        {...props}
      />
    </CardContextProvider>
  );
});

/** True inside a card that pads itself, where sections drop their own inset. */
function useInsetCard(): boolean {
  const card = useCardContext();
  return card !== null && card.padding !== "none";
}

export interface CardHeaderProps extends ComponentPropsWithRef<"div"> {
  /** A link or small button on the right, centred on the title's first line. */
  action?: ReactNode;
}

export function CardHeader({ className, action, children, ...props }: CardHeaderProps) {
  const inset = useInsetCard();
  // Edge-to-edge rows right under the header (List, an inline DataList)
  // bring their own 12px of padding, so the header keeps only 4px.
  const padding = inset ? "" : "p-5 [&:has(+[data-card-flush])]:pb-1";
  if (action === undefined || action === null || action === false) {
    return (
      <div className={cn("flex flex-col gap-1", padding, className)} {...props}>
        {children}
      </div>
    );
  }
  // The title keeps at least 8rem: an action too wide to leave it that much
  // (two text buttons on a phone) wraps onto its own line, right-aligned,
  // instead of squeezing the title to one word per line and drawing it
  // under the buttons.
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-wrap items-start gap-3", padding, className)}
      {...props}
    >
      <div data-slot="card-header-title" className="flex min-w-32 flex-1 flex-col gap-1">
        {children}
      </div>
      {/* As tall as the heading role's line, so a 32 or 44px control centres on the title and overflows the padding, not the layout. */}
      <div data-slot="card-header-action" className="ml-auto flex h-5.5 shrink-0 items-center">
        {action}
      </div>
    </div>
  );
}

export interface CardTitleProps extends ComponentPropsWithRef<"h3"> {
  /**
   * Heading level; `h3` by default, under the page's h1 and a section's h2.
   * `h1` for a card that is the whole screen (a sign-in or a gate card on
   * a page with no header of its own).
   */
  as?: "h1" | "h2" | "h3" | "h4" | "p";
}

export function CardTitle({ className, as: Heading = "h3", children, ...props }: CardTitleProps) {
  const card = useCardContext();
  return (
    <Heading
      className={cn("text-heading", card?.tone === "accent-soft" ? "" : "text-fg", className)}
      {...props}
    >
      {children}
    </Heading>
  );
}

export function CardDescription({ className, ...props }: ComponentPropsWithRef<"p">) {
  const card = useCardContext();
  const muted = card?.tone === "accent-soft" ? "text-accent-soft-fg-muted" : "text-fg-muted";
  return <p className={cn("text-body-sm", muted, className)} {...props} />;
}

/** Follows `CardHeader`; in an unpadded card it carries the 20px inset without the top half. */
export function CardContent({ className, ...props }: ComponentPropsWithRef<"div">) {
  const inset = useInsetCard();
  return <div className={cn(inset ? "" : "p-5 pt-0", className)} {...props} />;
}

/*
 * The footer is set apart by space, not a rule (hierarchy through type and
 * space; lines only inside lists and tables): 4px more than the rhythm of
 * the sections above it. In an unpadded card it follows the content's own
 * 20px inset; after an edge-to-edge list, whose rows bring 12px, it takes
 * 12px so the gap still totals 24.
 */
const FOOTER_INSET: Record<CardPadding, string> = {
  none: "p-5 pt-1 [[data-card-flush]+&]:pt-3",
  sm: "pt-1",
  md: "pt-1",
  lg: "pt-1",
};

export function CardFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  const card = useCardContext();
  return (
    <div
      className={cn("flex items-center gap-2", FOOTER_INSET[card?.padding ?? "none"], className)}
      {...props}
    />
  );
}
