import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

/** 44px wherever a field is 44px: a coarse pointer, or a screen narrower than md. */
const TOUCH_MIN_HEIGHT = "max-md:min-h-11 pointer-coarse:min-h-11";

// Radius 14 (controls, docs/07-ui-ux.md's "Hijau Segar" scale; not the 999
// pill radius, which stays for pills/avatars) so buttons read as the same
// soft clickable-surface language as inputs, cards, and dialogs.
// The label never wraps: the height is fixed, so a second line would spill
// out of the box. A row of actions that does not fit wraps or scrolls.
// Icons, from the `icon` prop or placed as a direct child, are 16px next to
// the 13px label (20px on `lg`), always 8px from it.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-label select-none " +
    "[&>svg]:size-4 [&>svg]:shrink-0 " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "aria-disabled:pointer-events-none aria-disabled:opacity-50",
  {
    variants: {
      variant: {
        // `motion-press` carries the color transition and the 0.98 press
        // scale; the link variant does without it (text links never press).
        primary:
          "rounded-md motion-press bg-accent text-accent-fg hover:bg-accent-strong active:bg-accent-strong",
        // `state-layer` paints hover and press over the opaque surface
        // instead of replacing it, so the button stays solid on any
        // backdrop (a dark camera overlay, the dark page background).
        secondary: "rounded-md motion-press border border-border bg-surface text-fg state-layer",
        ghost: "rounded-md motion-press text-fg hover:bg-state-hover active:bg-state-pressed",
        // `danger`'s fg is calibrated to sit on `bg`/`surface`, not to be a
        // solid fill with white text (it fails contrast in dark mode, where
        // the fg is deliberately light). `bg` itself, though, is exactly
        // the page background the fill needs to read against in both
        // themes: near-white on the dark-red light-theme fill, near-black
        // on the light-red dark-theme fill (checked by the token contrast
        // check as "bg on danger").
        danger: "rounded-md motion-press bg-danger text-bg hover:opacity-90 active:opacity-90",
        // An inline action that reads as a link ("Lihat semua"): accent
        // text, underline on hover, no box. On a touch screen its hit area
        // grows past 44px around the text (the 18px label line plus 14px
        // above and below) without moving the layout.
        link:
          "relative rounded-xs text-accent underline-offset-4 transition-colors hover:underline active:text-accent-strong " +
          "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3.5",
      },
      // The fields' scale (field-styles.ts FIELD_HEIGHT), so a button and
      // the field beside it are one height: 32 and 36 with a mouse on a
      // screen from md up, and both grow to 44 together wherever fields
      // do, on a touch screen at any width (a tablet or a touch laptop is
      // as imprecise as a phone) and on any screen narrower than md. The
      // growth is a minimum, so a caller's own taller height still wins.
      size: {
        sm: `h-8 px-3 ${TOUCH_MIN_HEIGHT}`,
        md: `h-9 px-4 ${TOUCH_MIN_HEIGHT}`,
        lg: "h-12 px-5 text-body font-semibold [&>svg]:size-5",
      },
    },
    // A link is as tall as its text and sits on the text's baseline.
    compoundVariants: [
      {
        variant: "link",
        size: ["sm", "md", "lg"],
        class: "h-auto px-0 max-md:min-h-0 pointer-coarse:min-h-0",
      },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

/** The leading edge sits 2px closer to an icon than to text, which reads as even padding. */
const ICON_PADDING = { sm: "pl-2.5", md: "pl-3.5", lg: "pl-4" } as const;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renders the props onto the single child element instead of a `<button>` (e.g. a `Link`). */
  asChild?: boolean;
  /** Shows a spinner and disables the button, whatever `disabled` says; content stays mounted for a stable width. */
  loading?: boolean;
  /** Leading icon, sized and colored automatically. */
  icon?: ReactNode;
}

/** A disabled link keeps its `href`; this stops Enter (and any click that gets through) from following it. */
function preventActivation(event: ReactMouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

/**
 * The one button. Defaults to `type="button"`, so a button inside a form
 * never submits it by accident; pass `type="submit"` for the one that
 * should. A loading button is always disabled, even when the caller also
 * passes `disabled={false}` (a valid form that is already saving).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, icon, disabled, type, onClick, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const inactive = Boolean(disabled) || Boolean(loading);
  const inactiveLink = asChild && inactive;
  const leading = Boolean(loading) || Boolean(icon);
  const iconSize = size === "lg" ? "size-5 [&>svg]:size-5" : "size-4 [&>svg]:size-4";
  return (
    <Comp
      ref={ref}
      // Lets a container size its buttons (a dialog's action row, styles.css).
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size }),
        leading && variant !== "link" && ICON_PADDING[size ?? "md"],
        className,
      )}
      // A child element (a link) has no `disabled`; it says so through ARIA
      // instead, the matching classes stop the pointer, and below it leaves
      // the tab order and ignores activation from the keyboard.
      {...(asChild
        ? { "aria-disabled": inactive || undefined }
        : { type: type ?? "button", disabled: inactive })}
      aria-busy={loading ?? undefined}
      {...props}
      {...(inactiveLink ? { tabIndex: -1, onClick: preventActivation } : { onClick })}
    >
      {loading ? (
        <Loader2 className={cn(iconSize, "shrink-0 animate-spin")} aria-hidden="true" />
      ) : (
        icon && (
          <span className={cn("flex shrink-0", iconSize)} aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {/* Slottable marks the caller's element as the one Slot merges into,
          so `asChild` still works while the icon and spinner sit beside it.
          Without it Radix rejects the two top-level children. */}
      <Slottable>{children}</Slottable>
    </Comp>
  );
});
