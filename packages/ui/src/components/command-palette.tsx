"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowDown, ArrowUp, CornerDownLeft, Search } from "lucide-react";
import type { ReactNode } from "react";

import { useReturnFocus } from "../hooks/use-return-focus.js";
import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { Kbd } from "./kbd.js";
import { keepOpenForToasts, OverlayScrim } from "./overlay-parts.js";
import { useUiLabels } from "./ui-labels.js";

export interface CommandPaletteItem {
  id: string;
  label: string;
  /**
   * Dim context at the row's end, such as the area a page belongs to
   * ("Akademik"). Read after the label and searched with it.
   */
  hint?: string;
  icon?: ReactNode;
  shortcut?: string;
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandPaletteGroup {
  heading: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandPaletteGroup[];
  /** Defaults to `UiLabels.commandPalettePlaceholder`. */
  placeholder?: string;
  /** Defaults to `UiLabels.commandPaletteEmpty`. */
  emptyLabel?: string;
  /** The dialog's accessible name; defaults to `UiLabels.commandPaletteLabel`. */
  label?: string;
  /** Called with the raw input text on every keystroke, for callers that fetch extra results. */
  onSearchChange?: (search: string) => void;
  /** Passed to cmdk: the caller's own ranking (higher is better, 0 hides the item). */
  filter?: (value: string, search: string, keywords?: string[]) => number;
  /** Passed to cmdk: false when the caller filters and orders `groups` itself. */
  shouldFilter?: boolean;
}

function Hint({ keys, label }: { keys: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-0.5">{keys}</span>
      {label}
    </span>
  );
}

/**
 * Global search (Ctrl/Cmd+K), per docs/07-ui-ux.md section 2. Results are
 * whatever `groups` the caller already filtered by permission; this
 * component renders and searches them (ranking can come from the caller
 * through `filter`). A 640px panel high on the screen with room for a
 * dozen results and a footer of keyboard hints; full screen on a phone,
 * with a cancel button in place of the Esc key.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder,
  emptyLabel,
  label,
  onSearchChange,
  filter,
  shouldFilter,
}: CommandPaletteProps) {
  const labels = useUiLabels();
  const name = label ?? labels.commandPaletteLabel;
  // Opened by a shortcut from anywhere, so focus goes back to wherever the
  // reader was (a field mid-edit), not to the page body.
  const returnFocus = useReturnFocus(undefined, undefined);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <OverlayScrim closeAnimation="dialog" />
        <DialogPrimitive.Content
          {...returnFocus}
          aria-describedby={undefined}
          onInteractOutside={keepOpenForToasts(undefined)}
          className={cn(
            "fixed z-modal flex flex-col overflow-hidden bg-surface-overlay text-fg outline-none",
            // Phone: the whole screen, so the keyboard never hides the results.
            "inset-0 h-dvh w-full",
            "max-sm:data-[state=open]:animate-enter max-sm:data-[state=closed]:animate-fade-out",
            // Tablet and up: a panel a little above the middle.
            "sm:inset-auto sm:top-[12dvh] sm:left-1/2 sm:h-auto sm:max-h-[min(36rem,calc(88dvh-2rem))] sm:w-[calc(100%-2rem)] sm:max-w-[40rem] sm:-translate-x-1/2",
            "sm:rounded-lg sm:border sm:border-border sm:shadow-3",
            "sm:data-[state=open]:animate-dialog-in sm:data-[state=closed]:animate-dialog-out",
            "data-[state=closed]:pointer-events-none!",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
          <CommandPrimitive
            label={name}
            filter={filter}
            shouldFilter={shouldFilter}
            loop
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-5">
              <Search className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
              <CommandPrimitive.Input
                placeholder={placeholder ?? labels.commandPalettePlaceholder}
                onValueChange={onSearchChange}
                className="h-full min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
              />
              <DialogPrimitive.Close asChild>
                <Button variant="link" size="sm" className="sm:hidden">
                  {labels.commandPaletteCancel}
                </Button>
              </DialogPrimitive.Close>
            </div>
            <CommandPrimitive.List
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 scroll-py-2",
                "[&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:flex-col [&_[cmdk-list-sizer]]:gap-1",
              )}
            >
              <CommandPrimitive.Empty className="px-4 py-12 text-center text-body-sm text-fg-muted">
                {emptyLabel ?? labels.commandPaletteEmpty}
              </CommandPrimitive.Empty>
              {groups.map((group) => (
                <CommandPrimitive.Group
                  key={group.heading}
                  heading={group.heading}
                  className={cn(
                    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5",
                    "[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-muted",
                  )}
                >
                  {group.items.map((item) => (
                    <CommandPrimitive.Item
                      key={item.id}
                      value={`${item.label} ${item.hint ?? ""} ${group.heading} ${item.id}`}
                      keywords={item.keywords}
                      onSelect={item.onSelect}
                      className={cn(
                        "group/item flex h-11 cursor-pointer items-center gap-3 rounded-[calc(var(--radius-lg)-8px)] px-3 text-body text-fg select-none",
                        // The pressed row is the selected one; a plain `active:`
                        // rule would sort before the `data-` one and never show.
                        "pointer-coarse:h-12 transition-colors data-[selected=true]:bg-state-hover data-[selected=true]:active:bg-state-pressed",
                        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
                      )}
                    >
                      {item.icon && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-fg-muted transition-colors [&>svg]:size-4",
                            "group-data-[selected=true]/item:bg-accent-soft group-data-[selected=true]/item:text-accent-soft-fg",
                          )}
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <>
                          {/* Keeps the label and the hint two words in the option's name. */}{" "}
                          {/* Gives up its width first: the label is the result. */}
                          <span className="max-w-[45%] shrink truncate text-caption text-fg-muted">
                            {item.hint}
                          </span>
                        </>
                      )}
                      {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
            <div
              aria-hidden="true"
              className="hidden shrink-0 items-center gap-5 border-t border-line px-5 py-2.5 text-caption text-fg-muted sm:flex"
            >
              <Hint
                keys={
                  <>
                    <Kbd>
                      <ArrowUp />
                    </Kbd>
                    <Kbd>
                      <ArrowDown />
                    </Kbd>
                  </>
                }
                label={labels.commandPaletteHintMove}
              />
              <Hint
                keys={
                  <Kbd>
                    <CornerDownLeft />
                  </Kbd>
                }
                label={labels.commandPaletteHintOpen}
              />
              <Hint keys={<Kbd>Esc</Kbd>} label={labels.commandPaletteHintClose} />
            </div>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
