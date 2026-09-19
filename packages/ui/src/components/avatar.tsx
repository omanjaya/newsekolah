import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

// A fixed, deterministic palette (not a rainbow of every hue) so two people
// with the same initials are still distinguishable at a glance without
// introducing colors DESIGN.md's status/accent system doesn't already own.
// Each entry is a light tint behind the status color used as text: the
// `status-*-fg` tokens ARE the status colors (text on a surface), so putting
// them on a solid `bg-status-*` circle would render the initials invisible.
const INITIAL_PALETTE = [
  "bg-status-excused/15 text-status-excused-fg",
  "bg-status-present/15 text-status-present-fg",
  "bg-status-dispensation/15 text-status-dispensation-fg",
  "bg-status-late/15 text-status-late-fg",
  "bg-status-sick/15 text-status-sick-fg",
  "bg-accent/15 text-accent",
] as const;

function paletteClassFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return INITIAL_PALETTE[hash % INITIAL_PALETTE.length] ?? INITIAL_PALETTE[0];
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export interface AvatarProps extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  /** Full name, used for the fallback initials and the image `alt`. */
  name: string;
  src?: string;
  size?: "sm" | "md";
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size = "md", className, ...props },
  ref,
) {
  const dimension = size === "sm" ? "size-6 text-[12px]" : "size-8 text-[13px]";
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
        dimension,
        className,
      )}
      {...props}
    >
      <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      <AvatarPrimitive.Fallback
        className={cn(
          "flex size-full items-center justify-center font-medium",
          paletteClassFor(name),
        )}
        delayMs={src ? 300 : 0}
      >
        {initialsFrom(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});
