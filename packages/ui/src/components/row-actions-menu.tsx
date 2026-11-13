"use client";

import { MoreHorizontal } from "lucide-react";
import { Fragment, type ReactElement } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { IconButton } from "./icon-button.js";

export interface RowActionsMenuItem {
  label: string;
  icon: ReactElement;
  onClick: () => void;
  /** "danger" renders the row in the destructive tone (delete, remove, ...). */
  tone?: "default" | "danger";
  disabled?: boolean;
}

export interface RowActionsMenuProps {
  /** Names the row, e.g. "Aksi untuk {barcode}": the trigger has no visible text of its own. */
  ariaLabel: string;
  items: RowActionsMenuItem[];
  /** On the menu panel. */
  className?: string;
}

/**
 * A table or list row's secondary actions collapsed behind one "..."
 * button, per docs/07-ui-ux.md section 5 ("aksi baris ikon dengan label")
 * and section 3's list pattern, never a row of bare icon buttons, which
 * fails that label requirement and eats 44px of touch target per action on
 * a phone. A real menu: arrow keys move between actions, Escape closes,
 * focus returns to the button. A separator sets destructive actions apart
 * from the ones before them; list them last.
 */
export function RowActionsMenu({ ariaLabel, items, className }: RowActionsMenuProps): ReactElement {
  return (
    // Not modal, like the popover it replaces: the table stays scrollable
    // and a click elsewhere just closes it.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<MoreHorizontal />} aria-label={ariaLabel} variant="ghost" size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={className}>
        {items.map((item, index) => {
          const previous = items[index - 1];
          const startsDanger =
            item.tone === "danger" && previous !== undefined && previous.tone !== "danger";
          return (
            <Fragment key={item.label}>
              {startsDanger && <DropdownMenuSeparator />}
              <DropdownMenuItem
                icon={item.icon}
                tone={item.tone}
                disabled={item.disabled}
                onSelect={item.onClick}
              >
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
