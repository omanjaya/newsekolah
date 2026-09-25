import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

/**
 * Soft-tinted pill (docs/07-ui-ux.md, "Hijau Segar"): each colored variant
 * pairs a `*-soft` background with its `*-soft-fg` text, both AA-checked in
 * packages/ui-tokens' contrast-check. `neutral` has no hue of its own, so it
 * keeps a hairline border instead for definition on a white card.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
  {
    variants: {
      variant: {
        neutral: "border border-border bg-bg text-fg-muted",
        accent: "bg-accent-soft text-accent-soft-fg",
        success: "bg-success-soft text-success-soft-fg",
        warning: "bg-warning-soft text-warning-soft-fg",
        danger: "bg-danger-soft text-danger-soft-fg",
        info: "bg-info-soft text-info-soft-fg",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = ComponentPropsWithoutRef<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
