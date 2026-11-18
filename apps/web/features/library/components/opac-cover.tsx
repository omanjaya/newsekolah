import { cn } from "@newsekolah/ui";
import type { ReactElement } from "react";

import { initialsFor } from "../../../lib/tenant/initials";

export type OpacCoverSize = "sm" | "md" | "lg";

const SIZE: Record<OpacCoverSize, string> = {
  sm: "w-8 rounded-xs text-caption font-heading font-bold",
  md: "w-full rounded-sm text-title-lg",
  lg: "w-20 rounded-sm text-title-lg sm:w-24",
};

// One category hue per title, picked from its name so a book keeps its
// colour everywhere it appears (list, shelf, detail).
const TONES = [
  "bg-category-green-soft text-category-green-soft-fg before:bg-category-green",
  "bg-category-blue-soft text-category-blue-soft-fg before:bg-category-blue",
  "bg-category-amber-soft text-category-amber-soft-fg before:bg-category-amber",
  "bg-category-purple-soft text-category-purple-soft-fg before:bg-category-purple",
  "bg-category-red-soft text-category-red-soft-fg before:bg-category-red",
] as const;

function toneFor(title: string): string {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 9973;
  return TONES[hash % TONES.length] ?? TONES[0];
}

/**
 * A stand-in book cover (the public catalogue has no cover images yet):
 * a soft tile in the title's category hue, a darker spine on the left and
 * the title's initials, in a book's 2:3 proportion. Decorative; the title
 * is always written beside it.
 */
export function OpacCover({
  title,
  size = "sm",
  className,
}: {
  title: string;
  size?: OpacCoverSize;
  className?: string;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid aspect-[2/3] shrink-0 select-none place-items-center overflow-hidden",
        "before:absolute before:inset-y-0 before:left-0 before:w-[12%] before:opacity-25 before:content-['']",
        SIZE[size],
        toneFor(title),
        className,
      )}
    >
      <span className="relative pl-[12%]">{initialsFor(title)}</span>
    </span>
  );
}
