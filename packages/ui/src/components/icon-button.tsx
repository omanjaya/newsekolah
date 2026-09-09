import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

const iconButtonVariants = cva(
  "inline-flex size-8 items-center justify-center rounded-sm text-fg transition-colors " +
    "duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-bg " +
    "disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-5",
  {
    variants: {
      variant: {
        ghost: "",
        outline: "border border-border",
      },
    },
    defaultVariants: { variant: "ghost" },
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  icon: ReactNode;
  /**
   * Required: an icon-only control has no visible text, so DESIGN.md ("Setiap
   * ikon tanpa teks wajib aria-label") and R-32 both require an accessible
   * name. TypeScript enforces this at the call site, not just at runtime.
   */
  "aria-label": string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant, icon, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(iconButtonVariants({ variant }), className)}
      {...props}
    >
      {icon}
    </button>
  );
});
