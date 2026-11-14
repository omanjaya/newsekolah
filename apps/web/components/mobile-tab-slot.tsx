"use client";

import { cn } from "@newsekolah/ui";
import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

/**
 * One slot of the bottom tab bar, after the artboard: a 22px icon over a
 * 12px label that never truncates, the active one in the accent at bold
 * weight, every slot shrinking to 0.98 while pressed. The labels are the
 * registry's short tab labels, chosen to fit five slots on a 360px phone.
 */
const SLOT_CLASS =
  "flex h-13 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-md px-0.5 text-caption whitespace-nowrap outline-none motion-press focus-visible:-outline-offset-2 [&>svg]:size-[22px] [&>svg]:shrink-0";

function slotState(active: boolean | undefined) {
  return active ? "font-bold text-accent" : "font-medium text-fg-muted active:text-fg";
}

/** A tab that opens a sheet (Menu). Typed from the button's own props so a Radix trigger can pass its handlers and ref through. */
export const TabSlot = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & { icon: ReactNode; label: string; active?: boolean }
>(function TabSlot({ icon, label, active, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(SLOT_CLASS, slotState(active), className)}
      {...props}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
});

/** A tab that navigates. */
export function TabLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(SLOT_CLASS, slotState(active))}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
