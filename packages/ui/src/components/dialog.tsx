"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { type ReturnFocusFallback, useReturnFocus } from "../hooks/use-return-focus.js";
import { cn } from "../utils/cn.js";

import {
  DialogFooter,
  focusOnOpen,
  GrabHandle,
  OverlayBody,
  OverlayDragDismiss,
  OverlayFooter,
  OverlayHeader,
  OverlayScrim,
  useOverlayContentRef,
} from "./overlay-parts.js";
import { useUiLabels } from "./ui-labels.js";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export { DialogFooter };

export type DialogSize = "sm" | "md" | "lg" | "xl";

/**
 * Widths on a tablet and up: `sm` 400 for a confirmation, `md` 480 for a
 * one-column form (the default), `lg` 640 for a two-column form, `xl` 800
 * for a table or a preview. A caller's own `max-w-*` still wins.
 */
const SIZE_CLASS: Record<DialogSize, string> = {
  sm: "max-w-[25rem]",
  md: "max-w-[30rem]",
  lg: "max-w-[40rem]",
  xl: "max-w-[50rem]",
};

export interface DialogContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  title: string;
  description?: string;
  /** Set when the title/description are rendered elsewhere and only needed for a11y. */
  hideHeader?: boolean;
  /** Overrides the close button's label from `UiLabels`. */
  closeLabel?: string;
  /**
   * Disables the header's close button, for the moment the dialog cannot
   * be dismissed (its action is running). Escape and the scrim are the
   * caller's to block, in `onOpenChange`, as `ConfirmDialog` does.
   */
  closeDisabled?: boolean;
  /**
   * Actions under the scrolling body, always visible. For a form whose
   * submit button must stay inside the `<form>`, end the form with
   * `DialogFooter` instead; it draws the same row.
   */
  footer?: ReactNode;
  /**
   * Where focus goes on closing when the element that opened the dialog
   * has left the page meanwhile (see `useReturnFocus`).
   */
  returnFocusFallback?: ReturnFocusFallback;
  /** Shown before the title, e.g. a warning icon in a soft circle. */
  icon?: ReactNode;
  /** Width from 640px up; below that the dialog is a full-width bottom sheet. */
  size?: DialogSize;
}

/**
 * A modal dialog. From 640px up it is a centred card (radius 20,
 * elevation 3) that fades and scales in; below 640px the same content is a
 * bottom sheet: full width, top radius 24, a grab handle, sliding up at
 * the sheet's pace, at most 90% of the screen tall, clear of the home
 * indicator, and dragged down to close from its handle or header (or its
 * body while scrolled to the top; overlay-drag.ts) unless `closeDisabled`
 * holds it open. In both, the header stays put, the body scrolls, and the
 * footer stays in reach, including a form's own trailing action row (see
 * `dialog-body` in styles.css), so existing dialogs get all of this
 * without changes. Footer buttons are `md`, never shorter than the fields
 * above them (styles.css holds a smaller one to that height). On opening,
 * focus goes to an element marked `data-autofocus`, else the first field
 * (with a mouse) or the panel itself (on a touch screen), never the close
 * button. On closing, focus goes back to the element that had it when the
 * dialog opened, even when the dialog was opened from state rather than a
 * `DialogTrigger`.
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  {
    className,
    title,
    description,
    hideHeader,
    closeLabel,
    closeDisabled,
    footer,
    icon,
    size = "md",
    onOpenAutoFocus,
    onCloseAutoFocus,
    returnFocusFallback,
    children,
    ...props
  },
  ref,
) {
  const labels = useUiLabels();
  const returnFocus = useReturnFocus(
    focusOnOpen(onOpenAutoFocus),
    onCloseAutoFocus,
    returnFocusFallback,
  );
  // A bottom sheet below 640px, which can then be dragged down to close
  // (not while it cannot be dismissed).
  const contentRef = useOverlayContentRef(ref, closeDisabled ? "off" : "phone");
  return (
    <DialogPrimitive.Portal>
      <OverlayScrim closeAnimation="responsive" />
      <DialogPrimitive.Content
        ref={contentRef}
        // Without a description there is nothing to point at; saying so
        // keeps Radix from warning about a missing one.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed z-modal flex flex-col overflow-hidden border border-border bg-surface-overlay text-fg shadow-3 outline-none",
          "[--dialog-px:var(--space-5)] [--dialog-pb:var(--space-5)] [--dialog-footer-pb:var(--space-3)] [--dialog-safe-bottom:env(safe-area-inset-bottom,0px)]",
          "sm:[--dialog-px:var(--space-6)] sm:[--dialog-pb:var(--space-6)] sm:[--dialog-footer-pb:var(--space-4)] sm:[--dialog-safe-bottom:0px]",
          // Phone: a bottom sheet.
          "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-xl border-x-0 border-b-0 max-sm:max-w-none",
          "max-sm:data-[state=open]:animate-sheet-in max-sm:data-[state=closed]:animate-sheet-out",
          // Tablet and up: a centred card that leaves a margin all round.
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border",
          "sm:data-[state=open]:animate-dialog-in sm:data-[state=closed]:animate-dialog-out",
          SIZE_CLASS[size],
          "data-[state=closed]:pointer-events-none!",
          className,
        )}
        {...props}
        {...returnFocus}
      >
        <GrabHandle className="sm:hidden" />
        <OverlayDragDismiss />
        {hideHeader ? (
          <>
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="sr-only">
                {description}
              </DialogPrimitive.Description>
            )}
          </>
        ) : (
          <OverlayHeader
            title={title}
            description={description}
            icon={icon}
            closeLabel={closeLabel ?? labels.dialogClose}
            closeDisabled={closeDisabled}
            className="pt-3 sm:pt-6"
          />
        )}
        {/* A confirmation says everything in its header; no empty body between it and the actions. */}
        {children !== undefined && children !== null && children !== false && (
          <OverlayBody padTop={Boolean(hideHeader)} padBottom={footer ? "plain" : "with-safe-area"}>
            {children}
          </OverlayBody>
        )}
        {footer && <OverlayFooter>{footer}</OverlayFooter>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
