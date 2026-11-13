"use client";

import type { ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { Skeleton } from "./skeleton.js";
import { useUiLabels } from "./ui-labels.js";

// A fixed rhythm of widths so a list of placeholders reads as text of
// different lengths, the same on every render (no random widths).
const TITLE_WIDTHS = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-5/12"] as const;
const META_WIDTHS = ["w-1/4", "w-1/3", "w-1/5", "w-2/7", "w-1/4"] as const;

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length] as T;
}

/** The shared frame: one polite status with a spoken name, the shapes hidden from it. */
function SkeletonRegion({ className, children }: { className?: string; children: ReactNode }) {
  const labels = useUiLabels();
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{labels.loading}</span>
      {children}
    </div>
  );
}

export interface SkeletonListProps {
  rows?: number;
  /** A round leading placeholder (avatar or icon circle) on each row. */
  leading?: boolean;
  /** Its own card surface; off when the list already sits in a Card. */
  framed?: boolean;
  className?: string;
}

/** Placeholder for a List of rows: the same 44px rhythm, so the real rows land where the shapes were. */
export function SkeletonList({
  rows = 5,
  leading = true,
  framed = true,
  className,
}: SkeletonListProps) {
  return (
    <SkeletonRegion
      className={cn(
        "flex flex-col divide-y divide-line",
        framed && "rounded-lg border border-border bg-surface shadow-1",
        className,
      )}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          {leading && <Skeleton className="size-10 rounded-full" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={cn("h-3.5 rounded-full", pick(TITLE_WIDTHS, index))} />
            <Skeleton className={cn("h-3 rounded-full", pick(META_WIDTHS, index))} />
          </div>
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

export interface SkeletonCardsProps {
  count?: number;
  className?: string;
}

/** Placeholder for a grid of stat tiles, with the tile's own size and radius. */
export function SkeletonCards({ count = 4, className }: SkeletonCardsProps) {
  return (
    <SkeletonRegion className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex min-h-26 flex-col gap-3.5 rounded-lg border border-border bg-surface p-4 shadow-1"
        >
          <Skeleton className="size-9.5 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-14 rounded-sm" />
            <Skeleton
              className={cn("h-3 rounded-full", pick(["w-3/4", "w-2/3", "w-1/2"], index))}
            />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

export interface SkeletonFormProps {
  fields?: number;
  /** A trailing row with a button-sized placeholder. */
  actions?: boolean;
  className?: string;
}

/** Placeholder for a form: label over a 40px control per field, then the actions. */
export function SkeletonForm({ fields = 4, actions = true, className }: SkeletonFormProps) {
  return (
    <SkeletonRegion className={cn("flex flex-col gap-5", className)}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton
            className={cn("h-3 rounded-full", pick(["w-24", "w-32", "w-20", "w-28"], index))}
          />
          <Skeleton className="h-11 w-full rounded-md md:h-10" />
        </div>
      ))}
      {actions && (
        <div className="flex justify-end gap-2 pt-1">
          <Skeleton className="h-11 w-24 rounded-md md:h-10" />
        </div>
      )}
    </SkeletonRegion>
  );
}

export interface SkeletonDetailProps {
  rows?: number;
  className?: string;
}

/** Placeholder for a detail page: an identity header, then label and value rows. */
export function SkeletonDetail({ rows = 6, className }: SkeletonDetailProps) {
  return (
    <SkeletonRegion className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2.5">
          <Skeleton className="h-5 w-1/3 rounded-sm" />
          <Skeleton className="h-3 w-1/4 rounded-full" />
        </div>
      </div>
      <div className="flex flex-col divide-y divide-line rounded-lg border border-border bg-surface shadow-1">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-5 py-3.5"
          >
            <Skeleton
              className={cn("h-3 rounded-full", pick(["w-2/3", "w-1/2", "w-3/5"], index))}
            />
            <Skeleton className={cn("h-3 rounded-full", pick(TITLE_WIDTHS, index + 2))} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
