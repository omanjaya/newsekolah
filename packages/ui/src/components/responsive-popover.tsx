"use client";

import {
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";
import { Sheet, SheetContent, SheetTrigger } from "./sheet.js";

/** Below `sm`: where a bottom sheet replaces the anchored popover (the same width `Toaster` uses). */
const SHEET_QUERY = "(width < 40rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(SHEET_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Whether the screen is phone-sized; false where `matchMedia` does not exist (tests, the server). */
function useSheetLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(SHEET_QUERY).matches,
    () => false,
  );
}

type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverContent>;

export interface ResponsivePopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The control that opens it, rendered as the trigger itself (`asChild`). */
  trigger: ReactElement;
  /**
   * What the panel is about, e.g. the filter's label: the sheet's title on
   * a phone, the popover's accessible name from `sm` up.
   */
  title: string;
  /** A sentence under the sheet's title on a phone. */
  description?: string;
  children: ReactNode;
  /** The popover's classes from `sm` up (its width and padding); the sheet keeps its own. */
  className?: string;
  align?: PopoverContentProps["align"];
  side?: PopoverContentProps["side"];
}

/**
 * A choice that opens from a control: an anchored `Popover` from `sm` up
 * and a bottom `Sheet` on a phone (titled, with the grab handle, dragged
 * down to close), so a long list never hangs off a small trigger into the
 * tab bar. Both close the same way and give focus back to the trigger.
 * In the sheet the body keeps the dialog's side padding; a list of rows
 * that should run edge to edge can pull itself out with `max-sm:-mx-3`.
 */
export function ResponsivePopover({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
  align,
  side,
}: ResponsivePopoverProps): ReactElement {
  const sheet = useSheetLayout();

  if (sheet) {
    return (
      <Sheet open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent title={title} description={description}>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent aria-label={title} align={align} side={side} className={className}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
