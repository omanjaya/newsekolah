import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

// Radius 14 (controls, docs/07-ui-ux.md's "Hijau Segar" scale; not the 999
// pill radius, which stays for pills/avatars) so buttons read as the same
// soft clickable-surface language as inputs, cards, and dialogs. Border, not
// shadow, since shadow is reserved for floating elements only.
// `motion-press` carries the color transition and the 0.98 press scale.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-label motion-press " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "aria-disabled:pointer-events-none aria-disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-strong active:bg-accent-strong",
        secondary:
          "border border-border bg-surface text-fg hover:bg-state-hover active:bg-state-pressed",
        ghost: "text-fg hover:bg-state-hover active:bg-state-pressed",
        // `danger`'s fg is calibrated to sit on `bg`/`surface`, not to be a
        // solid fill with white text (it fails contrast in dark mode, where
        // the fg is deliberately light). `bg` itself, though, is exactly
        // the page background the fill needs to read against in both
        // themes: near-white on the dark-red light-theme fill, near-black
        // on the light-red dark-theme fill (checked by the token contrast
        // check as "bg on danger").
        danger: "bg-danger text-bg hover:opacity-90 active:opacity-90",
      },
      size: {
        // Both sizes clear 44px on a touch screen and shrink once there is
        // a cursor. A compact button is a density choice for a dense
        // desktop table, not a reason to make a thumb miss on a phone.
        sm: "h-11 px-3 md:h-8",
        md: "h-11 px-4 md:h-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renders the props onto the single child element instead of a `<button>` (e.g. a `Link`). */
  asChild?: boolean;
  /** Shows a spinner and disables the button, whatever `disabled` says; content stays mounted for a stable width. */
  loading?: boolean;
  /** Leading icon, sized and colored automatically. */
  icon?: ReactNode;
}

/**
 * The one button. Defaults to `type="button"`, so a button inside a form
 * never submits it by accident; pass `type="submit"` for the one that
 * should. A loading button is always disabled, even when the caller also
 * passes `disabled={false}` (a valid form that is already saving).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, icon, disabled, type, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const inactive = Boolean(disabled) || Boolean(loading);
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      // A child element (a link) has no `disabled`; it says so through ARIA
      // instead, and the matching classes stop the pointer.
      {...(asChild
        ? { "aria-disabled": inactive || undefined }
        : { type: type ?? "button", disabled: inactive })}
      aria-busy={loading ?? undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        icon && (
          <span className="size-5 [&>svg]:size-5" aria-hidden="true">
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
