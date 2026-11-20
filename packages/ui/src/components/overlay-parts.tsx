"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { useScrollEdges } from "../hooks/use-scroll-edges.js";
import { cn } from "../utils/cn.js";

import { IconButton } from "./icon-button.js";
import { attachSheetDrag } from "./overlay-drag.js";
import { useToastClearance } from "./toast-clearance.js";

/*
 * The parts Dialog and Sheet share, so a dialog on a phone (a bottom
 * sheet) and a Sheet are the same object: grab handle, header with the
 * title on the title role, a scrolling body, and a footer that stays in
 * reach while the body scrolls. Spacing comes from CSS variables the
 * content element sets (`--dialog-px` side padding, `--dialog-pb` body
 * bottom padding, `--dialog-footer-pb`, `--dialog-safe-bottom` for the
 * home indicator), so the in-body footer can bleed to the edges exactly.
 */

/**
 * The scrim behind a dialog or sheet; it leaves with its layer and stops
 * taking clicks as it fades. It must forward its ref: `DialogPrimitive.Portal`
 * wraps each child in a Presence that watches that element's exit
 * animation, and without the element it unmounts the scrim on the first
 * frame of closing, while the panel above is still fading.
 */
export const OverlayScrim = forwardRef<
  HTMLDivElement,
  {
    /** The dialog's scrim leaves at 120ms, a sheet's at 200ms. */
    closeAnimation: "dialog" | "sheet" | "responsive";
  }
>(function OverlayScrim({ closeAnimation }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      // Found by a sheet's drag to dismiss, which fades it with the distance.
      data-overlay-scrim=""
      className={cn(
        "fixed inset-0 z-overlay bg-scrim",
        "data-[state=open]:animate-overlay-in",
        closeAnimation === "sheet" && "data-[state=closed]:animate-sheet-overlay-out",
        closeAnimation === "dialog" && "data-[state=closed]:animate-overlay-out",
        closeAnimation === "responsive" &&
          "data-[state=closed]:animate-overlay-out max-sm:data-[state=closed]:animate-sheet-overlay-out",
        // Radix sets `pointer-events: auto` inline, hence the important.
        "data-[state=closed]:pointer-events-none!",
      )}
    />
  );
});

/**
 * The pill at the top of a bottom sheet; it tells the eye the panel came
 * up from the edge. Visual only for assistive technology; to a finger it
 * is where the sheet can be dragged down from (with the header below it),
 * across the panel's full width.
 */
export function GrabHandle({ className }: { className?: string }): ReactElement {
  return (
    <div
      aria-hidden="true"
      data-sheet-drag=""
      className={cn("flex h-3 w-full shrink-0 items-end justify-center", className)}
    >
      <div className="h-1 w-9 rounded-full bg-border-strong/40" />
    </div>
  );
}

/**
 * The close path a drag to dismiss takes: a hidden Radix close button, so
 * the dialog's `onOpenChange` decides as it does for the visible one.
 */
export function OverlayDragDismiss(): ReactElement {
  return <DialogPrimitive.Close data-overlay-dismiss="" hidden tabIndex={-1} aria-hidden="true" />;
}

export interface OverlayHeaderProps {
  title: string;
  description?: string;
  /** Shown before the title, e.g. a warning in a soft circle. */
  icon?: ReactNode;
  closeLabel: string;
  /** Disables the close button while the dialog cannot be dismissed (an action is running). */
  closeDisabled?: boolean;
  /** Extra top padding when no grab handle sits above the header. */
  className?: string;
}

/**
 * Title (title role), optional description, and a close button centred on
 * the title's first line. A divider appears under it once the body has
 * scrolled, so the header never seems to cut through content.
 */
export function OverlayHeader({
  title,
  description,
  icon,
  closeLabel,
  closeDisabled,
  className,
}: OverlayHeaderProps): ReactElement {
  return (
    <div
      // On a bottom sheet the header is a drag handle too (overlay-drag.ts).
      data-sheet-drag=""
      className={cn(
        // 12px here and the body's 4px top inset make the 16px gap.
        "flex shrink-0 items-start gap-3 border-b border-transparent px-(--dialog-px) pb-3 transition-colors",
        "[[data-overflow-start]>&]:border-line",
        className,
      )}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DialogPrimitive.Title className="text-title text-fg">{title}</DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="text-body-sm text-fg-muted">
            {description}
          </DialogPrimitive.Description>
        )}
      </div>
      {/* As tall as the title's first line, so the button centres on it. */}
      <div className="-mr-2 flex h-6 shrink-0 items-center pointer-coarse:-mr-3">
        <DialogPrimitive.Close asChild>
          <IconButton
            icon={<X />}
            aria-label={closeLabel}
            size="sm"
            tooltip={false}
            disabled={closeDisabled}
            className="text-fg-muted hover:text-fg"
          />
        </DialogPrimitive.Close>
      </div>
    </div>
  );
}

/**
 * The scrolling middle. It reports its scroll edges to the content element
 * (`data-overflow-start` / `-end`), which the header and footer dividers
 * read. `dialog-body` (styles.css) also lifts a form's trailing action row
 * into the sticky footer.
 */
export function OverlayBody({
  children,
  padTop,
  padBottom,
}: {
  children: ReactNode;
  /** No header above: the body brings its own top padding. */
  padTop: boolean;
  /** A footer sits below and brings the safe-area padding instead. */
  padBottom: "with-safe-area" | "plain";
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref, { axis: "y", markParent: true });
  return (
    <div
      ref={ref}
      className={cn(
        "dialog-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-(--dialog-px)",
        // Under a header, a 4px inset keeps the first child's outside
        // ring and focus outline inside the scroller instead of clipped.
        padTop ? "pt-(--dialog-px)" : "pt-1",
        // With a footer below, its own top padding is most of the gap.
        padBottom === "with-safe-area"
          ? "pb-[calc(var(--dialog-pb)+var(--dialog-safe-bottom))]"
          : "pb-2",
      )}
    >
      {children}
    </div>
  );
}

const FOOTER_LAYOUT =
  "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-transparent px-(--dialog-px) transition-colors max-sm:*:flex-1";

/**
 * The `footer` prop's row, below the scrolling body. Its buttons are `md`,
 * the fields' height; one passed as `sm` is held to that height anyway
 * (styles.css), so the primary action is never the smallest control.
 */
export function OverlayFooter({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      // Measured so toasts are lifted clear of it (toast-clearance.ts).
      data-overlay-footer=""
      className={cn(
        FOOTER_LAYOUT,
        "pt-4 pb-[calc(var(--dialog-footer-pb)+var(--dialog-safe-bottom))]",
        "[[data-overflow-end]>&]:border-line",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The action row of a dialog or sheet, for forms whose submit button has
 * to live inside the `<form>`: put it last in the form and it sticks to
 * the bottom of the dialog while the fields scroll, bleeding to the
 * dialog's edges, with a divider only while content scrolls under it. On
 * a phone its buttons share the width. Outside a form, the `footer` prop
 * of `DialogContent` / `SheetContent` draws the same row.
 */
export const DialogFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  function DialogFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        // The body drops its bottom padding while it holds one (styles.css).
        data-dialog-footer=""
        data-overlay-footer=""
        className={cn(
          FOOTER_LAYOUT,
          "sticky bottom-0 z-[1] -mx-(--dialog-px) bg-surface-overlay",
          "pt-4 pb-[calc(var(--dialog-footer-pb)+var(--dialog-safe-bottom))]",
          "[[data-overflow-end]>.dialog-body_&]:border-line",
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * A live region at the top of a dialog's or sheet's scrolling body for the
 * outcome of an action taken further down (a status change with its undo).
 * It sticks under the header while the body scrolls, so the message and its
 * buttons are in view wherever the reader was when they acted; a notice in
 * the normal flow would be scrolled out of sight, above the row they used.
 * Place it as a direct child of the body (a fragment's first element):
 * sticky positioning holds only within its parent, so a wrapper would let
 * it scroll away with the wrapper. Empty, it takes no space.
 *
 * It publishes its height to the body as `--dialog-notice-h`, which
 * `dialog-body` (styles.css) reserves as top scroll padding while the
 * notice has content: browsers ignore sticky elements when they scroll a
 * focused control into view, so tabbing back up the rows could otherwise
 * leave the focused one under the opaque notice (WCAG 2.4.11).
 */
export const DialogNotice = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  function DialogNotice({ className, ...props }, ref) {
    const local = useRef<HTMLDivElement | null>(null);
    const setRef = useCallback(
      (node: HTMLDivElement | null) => {
        local.current = node;
        assignRef(ref, node);
      },
      [ref],
    );
    useEffect(() => {
      const node = local.current;
      const scroller = node?.parentElement;
      if (!node || !scroller) return;
      const publish = () => {
        scroller.style.setProperty("--dialog-notice-h", `${node.offsetHeight}px`);
      };
      publish();
      // Also fires when the notice goes from empty (not rendered) to shown.
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
      observer?.observe(node);
      return () => {
        observer?.disconnect();
        scroller.style.removeProperty("--dialog-notice-h");
      };
    }, []);
    return (
      <div
        ref={setRef}
        aria-live="polite"
        data-dialog-notice=""
        className={cn(
          // Bleeds over the body's side padding and its 4px top inset, so
          // rows scrolling under it never show at its edges or above it.
          "sticky top-0 z-sticky -mx-(--dialog-px) -mt-1 bg-surface-overlay px-(--dialog-px) pt-1 pb-3 empty:hidden",
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * The first field to fill in: a text-like input, a textarea, a select or a
 * combobox trigger that takes focus. Radix Select's hidden native copy
 * (`aria-hidden`, `tabindex=-1`) and read-only or disabled fields are skipped.
 */
const FIRST_FIELD = [
  "input:not([type=hidden], [type=checkbox], [type=radio], [type=file], [type=range])",
  "textarea",
  "select",
  "[role=combobox]",
]
  .map((field) => `${field}:not(:disabled, [readonly], [aria-disabled=true], [tabindex="-1"])`)
  .join(", ");

/** A fine primary pointer (a mouse or trackpad); true where `matchMedia` does not exist. */
function hasFinePointer(): boolean {
  return typeof window.matchMedia !== "function" || window.matchMedia("(pointer: fine)").matches;
}

function initialFocusTarget(content: HTMLElement): HTMLElement | null {
  const marked = content.querySelector<HTMLElement>("[data-autofocus]");
  if (marked) return marked;
  if (!hasFinePointer()) return null;
  const fields = Array.from(content.querySelectorAll<HTMLElement>(FIRST_FIELD));
  return fields.find((field) => !field.closest("[hidden], [inert], [aria-hidden=true]")) ?? null;
}

/**
 * Where focus lands when a dialog or sheet opens, in place of Radix's
 * first tabbable element (the close button, whose ring would greet every
 * keyboard open and whose Enter would close the form): an element marked
 * `data-autofocus`; else, with a fine pointer, the first field to fill in;
 * else the panel itself, which draws no ring and, on a touch screen, keeps
 * the on-screen keyboard down until the reader picks a field. The close
 * button stays one Tab away. A caller's own `onOpenAutoFocus` runs first,
 * and preventing its default keeps Radix's and this out of the way.
 */
export function focusOnOpen(
  onOpenAutoFocus: ((event: Event) => void) | undefined,
): (event: Event) => void {
  return (event) => {
    onOpenAutoFocus?.(event);
    if (event.defaultPrevented) return;
    const content = event.currentTarget;
    if (!(content instanceof HTMLElement)) return;
    event.preventDefault();
    const target = initialFocusTarget(content);
    target?.focus({ preventScroll: true });
    // Nothing to focus, or it refused (a disabled button): the panel takes it.
    if (!target || document.activeElement !== target) content.focus({ preventScroll: true });
  };
}

/**
 * An `onInteractOutside` for a modal overlay that ignores a press or focus
 * on a toast: the toaster is mounted at the app root, outside the overlay,
 * so Radix would otherwise treat clicking a toast's action (an undo for
 * what was just done inside the overlay) as a click outside and close the
 * overlay under it. Anything else reaches the caller's own handler.
 */
export function keepOpenForToasts<E extends Event>(
  onInteractOutside: ((event: E) => void) | undefined,
): (event: E) => void {
  return (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-sonner-toaster]")) {
      event.preventDefault();
      return;
    }
    onInteractOutside?.(event);
  };
}

/** Hands `node` to a forwarded ref, whichever kind it is. */
function assignRef<T>(ref: ForwardedRef<T>, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

/** When the panel is a bottom sheet that can be dragged down: always, only below 640px, or never. */
export type SheetDragMode = "always" | "phone" | "off";

function sheetLayoutNow(mode: SheetDragMode): boolean {
  if (mode === "off") return false;
  if (mode === "always") return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(width < 40rem)").matches;
}

/**
 * The content element's ref: the caller's, plus the toast clearance that
 * keeps toasts off this overlay's action row while it is open, plus drag
 * to dismiss (overlay-drag.ts) while it is laid out as a bottom sheet.
 */
export function useOverlayContentRef(
  forwarded: ForwardedRef<HTMLDivElement>,
  drag: SheetDragMode = "off",
): (node: HTMLDivElement | null) => void {
  const trackClearance = useToastClearance();
  const detach = useRef<(() => void) | null>(null);
  return useCallback(
    (node: HTMLDivElement | null) => {
      trackClearance(node);
      assignRef(forwarded, node);
      detach.current?.();
      detach.current = null;
      if (node && drag !== "off") {
        detach.current = attachSheetDrag(node, {
          enabled: () => sheetLayoutNow(drag),
          dismiss: () => {
            node.querySelector<HTMLElement>("[data-overlay-dismiss]")?.click();
          },
        });
      }
    },
    [forwarded, trackClearance, drag],
  );
}
