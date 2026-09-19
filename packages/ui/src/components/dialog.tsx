import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { useUiLabels } from "./ui-labels.js";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-(--z-overlay) bg-black/40",
        "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
        className,
      )}
      {...props}
    />
  );
}

export interface DialogContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  title: string;
  description?: string;
  /** Set when the title/description are rendered elsewhere and only needed for a11y. */
  hideHeader?: boolean;
  /** Localized label for the close control. Defaults to Indonesian for shared callers. */
  closeLabel?: string;
  footer?: ReactNode;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  { className, title, description, hideHeader, closeLabel, footer, children, ...props },
  ref,
) {
  const labels = useUiLabels();
  const resolvedCloseLabel = closeLabel ?? labels.dialogClose;
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // The width leaves a margin on a phone: a dialog flush against
          // both screen edges reads as a page, not as something on top of
          // one, and leaves nowhere to tap to dismiss it.
          "fixed left-1/2 top-1/2 z-(--z-modal) w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
          // A form long enough to outgrow the screen would otherwise run
          // off the top and bottom with no way to reach either end, since
          // the dialog is centred rather than anchored. Cap it and let its
          // own body scroll.
          "flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden",
          "rounded-sm border border-border bg-surface shadow-(--shadow-float)",
          "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          className,
        )}
        {...props}
      >
        {hideHeader ? (
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        ) : (
          <div className="flex shrink-0 items-start justify-between gap-4 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-[16px] font-medium text-fg">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-[13px] text-fg-muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label={resolvedCloseLabel}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xs text-fg-muted hover:bg-bg"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 md:px-6 md:pb-6">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-4 md:px-6">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
