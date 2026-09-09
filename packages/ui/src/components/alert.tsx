import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Info } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "../utils/cn.js";

const alertVariants = cva("flex gap-3 rounded-sm border p-4 text-[13px]", {
  variants: {
    variant: {
      info: "border-border bg-surface text-fg",
      warning: "border-status-late/40 bg-surface text-fg",
    },
  },
  defaultVariants: { variant: "info" },
});

export interface AlertProps
  extends ComponentPropsWithoutRef<"div">, VariantProps<typeof alertVariants> {
  title: string;
  icon?: ReactNode;
}

/** For a warning that should stay visible on the page (e.g. no active academic year), not a toast. */
export function Alert({ className, variant, title, icon, children, ...props }: AlertProps) {
  const Icon = variant === "warning" ? AlertTriangle : Info;
  return (
    <div role="status" className={cn(alertVariants({ variant }), className)} {...props}>
      <span
        className={cn(
          "mt-0.5 shrink-0",
          variant === "warning" ? "text-status-late" : "text-fg-muted",
        )}
        aria-hidden="true"
      >
        {icon ?? <Icon className="size-4" />}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-fg">{title}</p>
        {children && <div className="text-fg-muted">{children}</div>}
      </div>
    </div>
  );
}
