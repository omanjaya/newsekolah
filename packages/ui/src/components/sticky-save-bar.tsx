import type { ReactNode } from "react";

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
  className?: string;
}

/**
 * A fixed bottom action bar for a long, high-volume form: change count (or
 * whatever the caller puts in `leadingSlot`) plus a primary save action,
 * always in reach of a thumb on a phone. Sits above the mobile tab bar
 * (`--shell-mobile-tab-offset`) and the desktop sidebar
 * (`--shell-sidebar-width`), matching the shell's own fixed elements.
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
  className,
}: StickySaveBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[var(--shell-mobile-tab-offset)] z-(--z-sticky) border-t border-border bg-surface px-4 py-3 md:bottom-0 md:left-[var(--shell-sidebar-width)]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {leadingSlot}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          {trailingSlot}
          <Button
            onClick={onSave}
            loading={saving}
            disabled={disabled}
            className="w-full md:w-auto"
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
