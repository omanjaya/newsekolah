import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

/**
 * The generic elevated-surface container (docs/07-ui-ux.md, "Hijau Segar"):
 * white surface, radius-lg (20px), a hairline border standing in for the
 * mockup's 1px ring, and a subtle resting shadow. Composes with
 * `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`, or
 * is used bare for the icon-in-soft-circle tiles `Stat` builds on.
 */
export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface shadow-(--shadow-card)", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: ComponentPropsWithoutRef<"h3">) {
  return (
    <h3
      className={cn("font-heading text-[16px] font-bold tracking-tight text-fg", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("text-[13px] text-fg-muted", className)} {...props} />;
}

/** Follows `CardHeader`; use `p-5` via `className` for a standalone `Card`. */
export function CardContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("flex items-center gap-2 border-t border-line p-5", className)} {...props} />
  );
}
