"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

import { cn } from "../utils/cn.js";

import { IconButton } from "./icon-button.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";

export interface RowActionsMenuItem {
  label: string;
  icon: ReactElement;
  onClick: () => void;
  /** "danger" renders the label in the destructive status color (delete, remove, ...). */
  tone?: "default" | "danger";
  disabled?: boolean;
}

export interface RowActionsMenuProps {
  /** Names the row, e.g. "Aksi untuk {barcode}" -- the trigger has no visible text of its own. */
  ariaLabel: string;
  items: RowActionsMenuItem[];
  className?: string;
}

/**
 * A table or list row's secondary actions collapsed behind one "..."
 * button, per docs/07-ui-ux.md section 5 ("aksi baris ikon dengan label")
 * and section 3's list pattern -- never a row of bare icon buttons, which
 * both fails that label requirement and eats 44px of touch target per
 * action on a phone. Shared across every row that used to hand-roll this
 * Popover (library master data, catalogue, members, copies, ...).
 */
export function RowActionsMenu({ ariaLabel, items, className }: RowActionsMenuProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton icon={<MoreHorizontal />} aria-label={ariaLabel} variant="ghost" />
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("w-52", className)}>
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] hover:bg-bg disabled:pointer-events-none disabled:opacity-50",
                item.tone === "danger" ? "text-status-absent" : "text-fg",
              )}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
