import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

// Radius 8 (not the DESIGN.md 999 pill radius) so buttons read as the same
// clickable-surface language as cards and dialogs. Border, not shadow, since
// DESIGN.md reserves shadow for floating elements only.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm text-[13px] font-medium " +
    "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:shadow-[inset_0_0_0_1px_currentColor]",
        secondary: "border border-border bg-surface text-fg hover:bg-bg",
        ghost: "text-fg hover:bg-bg",
        danger: "bg-status-absent text-status-absent-fg hover:opacity-90",
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
  /** Shows a spinner and disables the button; content stays mounted for a stable width. */
  loading?: boolean;
  /** Leading icon, sized and colored automatically. */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, icon, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
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
