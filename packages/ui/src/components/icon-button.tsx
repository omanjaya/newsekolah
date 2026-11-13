"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { EnsureTooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.js";

// Round, like the artboard's header buttons. A touch screen always gets at
// least 44px (a minimum, so a caller's own larger size still wins); the
// icon itself keeps its size, only the area around it grows.
const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full motion-press select-none " +
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
    "pointer-coarse:min-h-11 pointer-coarse:min-w-11",
  {
    variants: {
      variant: {
        ghost: "text-fg hover:bg-state-hover active:bg-state-pressed",
        // A white disc with a 1px ring on the page background (the
        // artboard's notification button). `state-layer` paints hover
        // over the fill instead of replacing it.
        surface: "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--color-border)] state-layer",
        accent: "bg-accent text-accent-fg hover:bg-accent-strong active:bg-accent-strong",
        // The older name for `surface`, kept for existing call sites; renders the same.
        outline: "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--color-border)] state-layer",
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
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Shows a spinner and disables the button. */
  loading?: boolean;
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
function useTooltipOpen(expanded: boolean) {
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
  return {
    open: open && !expanded,
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
    loading,
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
  const tooltipState = useTooltipOpen(expanded);
  const Comp = asChild ? Slot : "button";
  const inactive = Boolean(disabled) || Boolean(loading);

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

  const button = (
    <Comp
      ref={ref}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...(asChild
        ? { "aria-disabled": inactive || undefined }
        : { type: type ?? "button", disabled: inactive })}
      aria-busy={loading ?? undefined}
      // The tooltip repeats the accessible name; describing the button with
      // it as well would make a screen reader say the name twice.
      aria-describedby={props["aria-describedby"]}
      {...props}
      onPointerEnter={handlePointerEnter}
      onBlur={handleBlur}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon}
      <Slottable>{children}</Slottable>
    </Comp>
  );

  if (tooltip === false || inactive) return button;

  return (
    <EnsureTooltipProvider>
      <Tooltip open={tooltipState.open} onOpenChange={tooltipState.onOpenChange}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>
          {typeof tooltip === "string" ? tooltip : label}
        </TooltipContent>
      </Tooltip>
    </EnsureTooltipProvider>
  );
});
