"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { EnsureTooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.js";

// A white disc with a 1px ring on the page background (the artboard's
// notification button), drawn like a secondary Button: a real border, so
// a caller's `border-accent` still colours it, and `state-layer` for hover
// and press. `state-layer` owns `box-shadow`, which is why the ring cannot
// be an inset shadow.
const SECONDARY = "border border-border bg-surface text-fg state-layer";
const PRIMARY = "bg-accent text-accent-fg hover:bg-accent-strong active:bg-accent-strong";

// Round, like the artboard's header buttons. A touch screen always gets at
// least 44px (a minimum, so a caller's own larger size still wins); the
// icon itself keeps its size, only the area around it grows.
const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full motion-press select-none " +
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
    "pointer-coarse:min-h-11 pointer-coarse:min-w-11",
  {
    variants: {
      // The same names as Button's, so a row pairing the two speaks one
      // vocabulary. `surface`, `outline` and `accent` are older names kept
      // for existing call sites; they render exactly the same.
      variant: {
        ghost: "text-fg hover:bg-state-hover active:bg-state-pressed",
        secondary: SECONDARY,
        primary: PRIMARY,
        surface: SECONDARY,
        outline: SECONDARY,
        accent: PRIMARY,
      },
      size: {
        sm: "size-8 [&>svg]:size-4",
        md: "size-9 [&>svg]:size-[18px]",
        lg: "size-11 [&>svg]:size-5",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  icon: ReactNode;
  /**
   * Required: an icon-only control has no visible text, so it needs an
   * accessible name. TypeScript enforces this at the call site, not just
   * at runtime. It is also the tooltip text.
   */
  "aria-label": string;
  /**
   * Shows the `aria-label` in a tooltip on hover and keyboard focus
   * (default). Pass a string for a different tooltip text, or `false`
   * where a visible label already sits next to the button.
   */
  tooltip?: boolean | string;
  /**
   * Becomes the tooltip text (unless `tooltip` is a string) instead of the
   * browser's own title, which would show a second tooltip with the same
   * words. With `tooltip={false}` it stays a plain `title`.
   */
  title?: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Shows a spinner and disables the button, keeping its full fill. */
  loading?: boolean;
  /**
   * Makes the button unavailable for a reason worth telling: it stays
   * focusable and hoverable (aria-disabled, not disabled) but ignores
   * clicks. The tooltip -- on mouse hover as well as on keyboard focus --
   * reads "<tooltip>: <reason>", so a sighted reader still sees what the
   * button is, and the reason alone is its accessible description, so a
   * screen reader does not say the name twice. A plain `disabled` button
   * takes no pointer events, so a mouse user would never see why.
   */
  disabledReason?: string;
  /** Renders onto the single child element (a `Link`) instead of a `<button>`. */
  asChild?: boolean;
}

/**
 * A button that opens a menu or popover gets focus back when the popup
 * closes, and a tooltip opening on that focus would flash over the page
 * after every use. This keeps the tooltip shut from the moment the popup
 * opens until the reader shows a new intent: the pointer enters the
 * button again, or focus moves away and comes back.
 */
function useTooltipOpen(expanded: boolean, inactive: boolean) {
  const [open, setOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [wasExpanded, setWasExpanded] = useState(expanded);
  // Adjusting state while rendering, React's pattern for following a prop:
  // the popup opening closes the tooltip and holds it shut.
  if (expanded !== wasExpanded) {
    setWasExpanded(expanded);
    if (expanded) {
      setOpen(false);
      setSuppressed(true);
    }
  }
  // A button that turns disabled or busy under the pointer drops its
  // tooltip, and does not bring it back by itself when it turns active.
  if (inactive && open) setOpen(false);
  return {
    open: open && !expanded && !inactive,
    onOpenChange: (next: boolean) => {
      setOpen(next && !suppressed);
    },
    release: () => {
      if (!expanded) setSuppressed(false);
    },
  };
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    className,
    variant,
    size,
    icon,
    tooltip = true,
    tooltipSide = "top",
    title,
    loading,
    disabledReason,
    asChild,
    disabled,
    type,
    children,
    ...props
  },
  ref,
) {
  const label = props["aria-label"];
  const expanded = props["aria-expanded"] === true || props["aria-expanded"] === "true";
  const inactive = Boolean(disabled) || Boolean(loading);
  // Unavailable with a reason: still reachable, so the reason can show.
  const explained = disabledReason !== undefined && !inactive;
  const reasonId = useId();
  const tooltipState = useTooltipOpen(expanded, inactive);
  const Comp = asChild ? Slot : "button";

  // Typed from the button's own props, not inferred from `Comp`: an asChild
  // Slot types its events on HTMLElement, which would widen the event here.
  const handlePointerEnter: ButtonHTMLAttributes<HTMLButtonElement>["onPointerEnter"] = (event) => {
    tooltipState.release();
    props.onPointerEnter?.(event);
  };
  const handleBlur: ButtonHTMLAttributes<HTMLButtonElement>["onBlur"] = (event) => {
    tooltipState.release();
    props.onBlur?.(event);
  };
  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>["onClick"] = (event) => {
    if (explained) {
      event.preventDefault();
      return;
    }
    props.onClick?.(event);
  };

  const button = (
    <Comp
      ref={ref}
      className={cn(
        iconButtonVariants({ variant, size }),
        // Busy, not unavailable: the fill stays, like Button's.
        loading && "disabled:opacity-100 aria-disabled:opacity-100",
        // Hover has to reach it for the reason's tooltip to open.
        explained && "aria-disabled:pointer-events-auto cursor-not-allowed",
        className,
      )}
      {...(asChild
        ? { "aria-disabled": inactive || undefined }
        : { type: type ?? "button", disabled: inactive })}
      aria-busy={loading ?? undefined}
      title={tooltip === false ? title : undefined}
      {...props}
      {...(explained ? { "aria-disabled": true } : {})}
      // The tooltip repeats the accessible name; describing the button with
      // it as well would make a screen reader say the name twice. A reason
      // is not the name, so it does describe the button.
      aria-describedby={explained ? reasonId : props["aria-describedby"]}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onBlur={handleBlur}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon}
      <Slottable>{children}</Slottable>
    </Comp>
  );
  const reason = explained ? (
    <span id={reasonId} className="sr-only">
      {disabledReason}
    </span>
  ) : null;

  if (tooltip === false) {
    return reason ? (
      <>
        {button}
        {reason}
      </>
    ) : (
      button
    );
  }

  const tooltipText = typeof tooltip === "string" ? tooltip : (title ?? label);

  // The tree keeps this shape while the button turns disabled or busy and
  // back (the tooltip is held shut instead), so React keeps the same DOM
  // node and a keyboard user's focus stays where it was.
  return (
    <EnsureTooltipProvider>
      <Tooltip open={tooltipState.open} onOpenChange={tooltipState.onOpenChange}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>
          {explained ? `${tooltipText}: ${disabledReason}` : tooltipText}
        </TooltipContent>
      </Tooltip>
      {reason}
    </EnsureTooltipProvider>
  );
});
