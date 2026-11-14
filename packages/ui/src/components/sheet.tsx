"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { useReturnFocus } from "../hooks/use-return-focus.js";
import { cn } from "../utils/cn.js";

import {
  DialogFooter,
  focusOnOpen,
  GrabHandle,
  OverlayBody,
  OverlayFooter,
  OverlayHeader,
  OverlayScrim,
  useOverlayContentRef,
} from "./overlay-parts.js";
import { useUiLabels } from "./ui-labels.js";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
/** The sticky action row, the same as `DialogFooter`. */
export const SheetFooter = DialogFooter;

export type SheetSide = "bottom" | "right";
export type SheetSize = "sm" | "md" | "lg";

/** Drawer widths from 640px up (`side="right"`): 384, 448 (default), 576. */
const DRAWER_SIZE: Record<SheetSize, string> = {
  sm: "sm:max-w-[24rem]",
  md: "sm:max-w-[28rem]",
  lg: "sm:max-w-[36rem]",
};

export interface SheetContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  title: string;
  description?: string;
  /** Set when the title/description are rendered elsewhere and only needed for a11y. */
  hideHeader?: boolean;
  /** Overrides the close button's label from `UiLabels`. */
  closeLabel?: string;
  /** Disables the header's close button while the sheet cannot be dismissed. */
  closeDisabled?: boolean;
  /** Actions under the scrolling body, always visible (or end a form with `SheetFooter`). */
  footer?: ReactNode;
  /** Shown before the title. */
  icon?: ReactNode;
  /**
   * "bottom" (default): a bottom sheet at every width, centred and at most
   * 640 wide on a larger screen. "right": a drawer floating at the right
   * edge from 640px up, for a row's details beside a table; still a bottom
   * sheet on a phone.
   */
  side?: SheetSide;
  /** The drawer's width (`side="right"`). */
  size?: SheetSize;
}

/**
 * The same layer as `Dialog`'s phone layout (grab handle, title role,
 * scrolling body, sticky footer, safe-area padding), so a sheet and a
 * dialog on a phone are one object. A drawer slides in from the right at
 * the sheet's pace instead, full height, with a form's action row pinned
 * to its bottom edge however short the form. Like `Dialog`, it opens on
 * the first field (or the panel itself on a touch screen), not the close
 * button, and gives focus back to the element that had it when it opened.
 */
export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(function SheetContent(
  {
    className,
    title,
    description,
    hideHeader,
    closeLabel,
    closeDisabled,
    footer,
    icon,
    side = "bottom",
    size = "md",
    onOpenAutoFocus,
    onCloseAutoFocus,
    children,
    ...props
  },
  ref,
) {
  const labels = useUiLabels();
  const returnFocus = useReturnFocus(focusOnOpen(onOpenAutoFocus), onCloseAutoFocus);
  const contentRef = useOverlayContentRef(ref);
  const drawer = side === "right";
  return (
    <DialogPrimitive.Portal>
      <OverlayScrim closeAnimation="sheet" />
      <DialogPrimitive.Content
        ref={contentRef}
        {...(description ? {} : { "aria-describedby": undefined })}
        data-side={side}
        className={cn(
          "fixed z-modal flex flex-col overflow-hidden border border-border bg-surface-overlay text-fg shadow-3 outline-none",
          "[--dialog-px:var(--space-5)] [--dialog-pb:var(--space-5)] [--dialog-footer-pb:var(--space-3)] [--dialog-safe-bottom:env(safe-area-inset-bottom,0px)]",
          "sm:[--dialog-px:var(--space-6)] sm:[--dialog-pb:var(--space-6)] sm:[--dialog-footer-pb:var(--space-4)]",
          // A bottom sheet: on a phone always, and for side="bottom" everywhere.
          "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-xl border-b-0 max-sm:border-x-0",
          drawer
            ? [
                "max-sm:data-[state=open]:animate-sheet-in max-sm:data-[state=closed]:animate-sheet-out",
                // A drawer floating 8px off the right edge, full height.
                "sm:inset-y-2 sm:right-2 sm:left-auto sm:max-h-none sm:w-[calc(100%-1rem)] sm:rounded-xl sm:border-b sm:[--dialog-safe-bottom:0px]",
                "sm:data-[state=open]:animate-drawer-in sm:data-[state=closed]:animate-drawer-out",
                DRAWER_SIZE[size],
              ]
            : [
                "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
                "sm:mx-auto sm:max-w-[40rem]",
              ],
          "data-[state=closed]:pointer-events-none!",
          className,
        )}
        {...props}
        {...returnFocus}
      >
        <GrabHandle className={drawer ? "sm:hidden" : undefined} />
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
            closeLabel={closeLabel ?? labels.sheetClose}
            closeDisabled={closeDisabled}
            className={drawer ? "pt-3 sm:pt-6" : "pt-3"}
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
