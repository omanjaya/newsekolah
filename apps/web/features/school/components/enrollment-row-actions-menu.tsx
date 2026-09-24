"use client";

import { IconButton, Popover, PopoverContent, PopoverTrigger } from "@newsekolah/ui";
import { ArrowRightLeft, MoreHorizontal, UserMinus } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

/**
 * A roster row's two enrollment actions, collapsed behind one "..." button
 * instead of two bare icons side by side: on a phone that pair used to
 * push every one of 30+ rows to a second line for a class list that is
 * otherwise a single compact line per student (docs/07-ui-ux.md's row
 * height rule). Mirrors attendance's SessionRowActionsMenu -- menu items
 * carry full text labels since they are no longer squeezed for row space.
 */
export function EnrollmentRowActionsMenu({
  moveLabel,
  leaveLabel,
  menuLabel,
  onMove,
  onLeave,
}: {
  moveLabel: string;
  leaveLabel: string;
  menuLabel: string;
  onMove: () => void;
  onLeave: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton icon={<MoreHorizontal />} aria-label={menuLabel} variant="outline" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg"
            onClick={() => {
              onMove();
              setOpen(false);
            }}
          >
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            {moveLabel}
          </button>
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg"
            onClick={() => {
              onLeave();
              setOpen(false);
            }}
          >
            <UserMinus className="size-4" aria-hidden="true" />
            {leaveLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
