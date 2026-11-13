import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

import { useUiLabels } from "./ui-labels.js";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export interface SheetContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  title: string;
  description?: string;
  /** Localized label for the close control. Defaults to Indonesian for shared callers. */
  closeLabel?: string;
}

/** Bottom sheet, the mobile counterpart to `Dialog` (see docs/05-shared-components.md section 2). */
export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(function SheetContent(
  { className, title, description, closeLabel, children, ...props },
  ref,
) {
  const labels = useUiLabels();
  const resolvedCloseLabel = closeLabel ?? labels.sheetClose;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-overlay bg-scrim",
          "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-modal flex max-h-[85dvh] flex-col overflow-hidden",
          "rounded-t-xl border-t border-border bg-surface-raised shadow-3",
          "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
          className,
        )}
        {...props}
      >
        <div
          className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border-strong/50"
          aria-hidden="true"
        />
        <div className="flex shrink-0 items-start justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-title text-fg">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-body-sm text-fg-muted">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label={resolvedCloseLabel}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-state-hover hover:text-fg active:bg-state-pressed"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 md:px-6 md:pb-6">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
