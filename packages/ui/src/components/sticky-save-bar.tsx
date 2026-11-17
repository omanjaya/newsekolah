"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { cn } from "../utils/cn.js";

import { Button } from "./button.js";

export interface StickySaveBarProps {
  /** Left side: a reason field, a hint, or a pending-changes count -- whatever the caller needs there. */
  leadingSlot: ReactNode;
  /** Rendered before the save button, e.g. an inline error with its own retry action. */
  trailingSlot?: ReactNode;
  saveLabel: ReactNode;
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
  /**
   * The page container the bar's content lines up with: "full" (default)
   * spans the content area at the page gutter (16px on a phone, 24px from
   * 768px), the others match `PageShell`'s narrow (720), default (1200)
   * and wide (1440) containers. Like a narrow page's content, "narrow"
   * sits at the left edge of the default column, not centred.
   */
  container?: "full" | "narrow" | "default" | "wide";
  className?: string;
}

const CONTAINER_CLASS = {
  full: "",
  narrow: "max-w-narrow",
  default: "mx-auto max-w-default",
  wide: "mx-auto max-w-wide",
} as const;

/**
 * Publishes the bar's height as `--sticky-save-bar-height` on the root
 * while it is shown, so the Toaster lifts its toasts above it instead of
 * covering the save button.
 */
function usePublishedHeight(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty("--sticky-save-bar-height", `${bar.offsetHeight}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--sticky-save-bar-height");
    };
  }, [ref]);
}

/**
 * A fixed bottom action bar for a long, high-volume form: change count (or
 * whatever the caller puts in `leadingSlot`) plus a primary save action,
 * always in reach of a thumb on a phone. Sits above the mobile tab bar
 * (`--shell-mobile-tab-offset`) and beside the desktop sidebar
 * (`--shell-sidebar-width`), matching the shell's own fixed elements, and
 * lines its content up with the page gutter. It slides up when it appears
 * (200ms, a fade under reduced motion).
 *
 * Introduced for `attendance/components/session-save-bar.tsx` (the
 * roster's save bar) and reused as-is by the gradebook, per
 * docs/05-shared-components.md's "cari di sini dulu" rule -- a pattern two
 * features need moves here instead of being copied.
 */
export function StickySaveBar({
  leadingSlot,
  trailingSlot,
  saveLabel,
  saving,
  disabled,
  onSave,
  container = "full",
  className,
}: StickySaveBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeight(ref);
  const row = (
    <div
      className={cn(
        "flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4",
        CONTAINER_CLASS[container],
      )}
    >
      {leadingSlot}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        {trailingSlot}
        <Button onClick={onSave} loading={saving} disabled={disabled} className="w-full md:w-auto">
          {saveLabel}
        </Button>
      </div>
    </div>
  );
  return (
    <div
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-[var(--shell-mobile-tab-offset,0px)] z-sticky md:bottom-0 md:left-[var(--shell-sidebar-width,0px)]",
        "border-t border-border bg-surface-raised px-4 py-3 md:px-6",
        "animate-rise-in",
        className,
      )}
    >
      {/* A narrow page's content sits at the left of the default column
          (PageShell), so the narrow row does too. */}
      {container === "narrow" ? <div className="mx-auto max-w-default">{row}</div> : row}
    </div>
  );
}
