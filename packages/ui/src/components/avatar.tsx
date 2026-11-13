"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

import { CATEGORY_TONES, TONE_CLASSES, type CategoryTone } from "./tone.js";

export type AvatarPixelSize = 24 | 32 | 40 | 44 | 48 | 64;
/** A pixel size, or the two names the first version had (`sm` 24, `md` 32). */
export type AvatarSize = AvatarPixelSize | "sm" | "md";
export type AvatarTone = CategoryTone | "accent";

// Initials are 700 on the soft category tint with its AA-checked text
// colour, about a third of the circle tall. The artboard's 44px header
// avatar is 15/700; the body role at 14 is the nearest step.
const SIZE_CLASS: Record<AvatarPixelSize, string> = {
  24: "size-6 text-caption font-bold",
  32: "size-8 text-label font-bold",
  40: "size-10 text-body font-bold",
  44: "size-11 text-body font-bold",
  48: "size-12 text-heading font-sans",
  64: "size-16 text-title-lg font-sans",
};

export function avatarPixelSize(size: AvatarSize): AvatarPixelSize {
  if (size === "sm") return 24;
  if (size === "md") return 32;
  return size;
}

/** Lets AvatarGroup size its avatars once instead of on every child. */
export const AvatarSizeContext = createContext<AvatarSize | null>(null);

// A fixed, deterministic pick from the category hues, so two people with
// the same initials are still told apart at a glance without leaving the
// token palette.
function toneFor(seed: string): CategoryTone {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_TONES[hash % CATEGORY_TONES.length] ?? "green";
}

/** Two initials, or one for the 24px avatar, where a second letter no longer fits the circle. */
function initialsFrom(name: string, pixels: AvatarPixelSize): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 && pixels > 24 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export interface AvatarProps extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  /** Full name, used for the fallback initials and the image `alt`. */
  name: string;
  src?: string;
  /** 24 to 64px; defaults to 32 (or the size of the surrounding AvatarGroup). */
  size?: AvatarSize;
  /** Pins the tint (`accent` for the signed-in user); otherwise picked from the name. */
  tone?: AvatarTone;
  /**
   * Hides the avatar from assistive technology when the name is already
   * written next to it, so it is not read twice. Otherwise the avatar is an
   * image named after the person, whether it shows a photo or initials.
   */
  decorative?: boolean;
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size, tone, decorative = false, className, ...props },
  ref,
) {
  const groupSize = useContext(AvatarSizeContext);
  const pixels = avatarPixelSize(size ?? groupSize ?? 32);
  return (
    <AvatarPrimitive.Root
      ref={ref}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-surface-sunken",
        SIZE_CLASS[pixels],
        className,
      )}
      {...props}
    >
      <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      <AvatarPrimitive.Fallback
        className={cn(
          "flex size-full items-center justify-center",
          TONE_CLASSES[tone ?? toneFor(name)].soft,
        )}
        // Initials without a photo show on the first render (no empty
        // circle, no flash after hydration); a photo gets 300ms to load first.
        delayMs={src ? 300 : undefined}
      >
        {initialsFrom(name, pixels)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});
