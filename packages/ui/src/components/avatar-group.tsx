"use client";

import { Children, type ComponentPropsWithRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import {
  AvatarSizeContext,
  avatarPixelSize,
  type AvatarPixelSize,
  type AvatarSize,
} from "./avatar.js";
import { useUiLabels } from "./ui-labels.js";

// The overlap grows with the avatar, about a fifth of its width: enough to
// read as one stack, little enough that the covered avatar's initials stay
// legible. At 24px two initials fill most of the circle, so the stack
// overlaps by 2px and lets the 2px surface ring do the separating.
const OVERLAP_CLASS: Record<AvatarPixelSize, string> = {
  24: "-space-x-0.5",
  32: "-space-x-1.5",
  40: "-space-x-2",
  44: "-space-x-2",
  48: "-space-x-2.5",
  64: "-space-x-3",
};

// The weight comes after the type role: a role sets its own weight, and
// tailwind-merge drops a weight written before it.
const MORE_SIZE_CLASS: Record<AvatarPixelSize, string> = {
  24: "size-6 text-caption font-semibold",
  32: "size-8 text-caption font-semibold",
  40: "size-10 text-label font-semibold",
  44: "size-11 text-label font-semibold",
  48: "size-12 text-label font-semibold",
  64: "size-16 text-body font-semibold",
};

export interface AvatarGroupProps extends ComponentPropsWithRef<"div"> {
  /** Avatar elements; leave their `size` unset so they take the group's. */
  children: ReactNode;
  size?: AvatarSize;
  /** Show at most this many, then a "+N" chip for the rest. */
  max?: number;
}

/** Overlapping avatars for "who is in this": each one ringed in the surface colour so the stack stays legible. */
export function AvatarGroup({ children, size = 32, max, className, ...props }: AvatarGroupProps) {
  const labels = useUiLabels();
  const pixels = avatarPixelSize(size);
  const items = Children.toArray(children);
  const visible = max !== undefined && items.length > max ? items.slice(0, max) : items;
  const hidden = items.length - visible.length;
  return (
    <AvatarSizeContext.Provider value={pixels}>
      <div
        role="group"
        className={cn(
          "flex items-center [&>*]:ring-2 [&>*]:ring-surface",
          OVERLAP_CLASS[pixels],
          className,
        )}
        {...props}
      >
        {visible}
        {hidden > 0 && (
          <span
            role="img"
            aria-label={labels.avatarGroupMore(hidden)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-sunken text-fg-muted tabular-nums",
              MORE_SIZE_CLASS[pixels],
            )}
          >
            +{hidden}
          </span>
        )}
      </div>
    </AvatarSizeContext.Provider>
  );
}
