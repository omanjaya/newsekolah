import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 text-[12px] font-medium",
  {
    variants: {
      variant: {
        neutral: "border-border bg-bg text-fg",
        accent: "border-accent/30 bg-accent/10 text-accent",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = ComponentPropsWithoutRef<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
