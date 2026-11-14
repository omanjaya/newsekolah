"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactElement } from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

import { cn } from "../utils/cn.js";

import { TOAST_CLEARANCE_VAR, TOAST_EDGE_PX, TOAST_WIDTH_PX } from "./toast-clearance.js";
import { useUiLabels } from "./ui-labels.js";

export type ToasterProps = ComponentPropsWithoutRef<typeof SonnerToaster>;

/** Errors stay up long enough to actually read (docs/07-ui-ux.md), but are
 * still dismissible early via the close button -- never fully blocking. */
const ERROR_DURATION_MS = 8000;

/** The phone layout's breakpoint, the same as Dialog's bottom sheet. */
const PHONE_QUERY = "(width < 40rem)";

let announceError: ((message: string) => void) | null = null;

/**
 * Sonner's own toast list is a single `aria-live="polite"` region (by
 * design -- a toast is never meant to interrupt), which is right for
 * success/info but too easy to miss for an error a user needs to notice.
 * This mirrors just the error toast's text into a separate, visually
 * hidden `role="alert"`/`aria-live="assertive"` region so screen readers
 * announce it immediately, without changing how errors render on screen.
 */
function ErrorAnnouncer(): ReactElement {
  const [message, setMessage] = useState("");
  useEffect(() => {
    announceError = setMessage;
    return () => {
      announceError = null;
    };
  }, []);
  return (
    <div role="alert" aria-live="assertive" className="sr-only">
      {message}
    </div>
  );
}

/** Whether the screen is phone-sized; false where `matchMedia` does not exist (tests, the server). */
function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const query = window.matchMedia(PHONE_QUERY);
      query.addEventListener("change", onChange);
      return () => {
        query.removeEventListener("change", onChange);
      };
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/** The 32px soft circle the artboard puts the icon in, one tone per kind. */
function ToastIcon({ tone }: { tone: "success" | "danger" | "info" | "warning" }): ReactElement {
  const Icon = { success: CircleCheck, danger: CircleAlert, info: Info, warning: TriangleAlert }[
    tone
  ];
  return <Icon className="size-5" strokeWidth={2.2} aria-hidden="true" />;
}

/**
 * Mount once at the app root. Drawn per the artboard: a raised surface
 * with a 1px ring, radius 14, elevation 3, the icon in a 32px soft circle,
 * the title on the label role and the description on body-sm. At the top
 * of a phone screen (clear of the tab bar and the save bar, under the
 * thumb's reach of nothing) and at the bottom right on a larger screen,
 * 420 wide, lifted above a `StickySaveBar` when one is showing, and above
 * the action row of an open drawer or sheet that reaches that corner
 * (toast-clearance.ts). A toast with both a description and an action
 * puts the action under the text (styles.css), so neither squeezes the
 * other. In over 200ms, out over 120ms (styles.css). At most three at
 * once, per docs/05-shared-components.md.
 */
export function Toaster({ toastOptions, style, ...props }: ToasterProps) {
  const labels = useUiLabels();
  const phone = usePhoneLayout();
  return (
    <>
      <SonnerToaster
        // Wider than sonner's 356px, so a title and its description fit one line each.
        style={{ "--width": `${TOAST_WIDTH_PX}px`, ...style } as CSSProperties}
        position={phone ? "top-center" : "bottom-right"}
        visibleToasts={3}
        gap={8}
        offset={{
          right: TOAST_EDGE_PX,
          // Above a StickySaveBar, and above the action row of an open
          // drawer, sheet or tall dialog that reaches this corner.
          bottom: `max(calc(${TOAST_EDGE_PX}px + var(--sticky-save-bar-height, 0px)), var(${TOAST_CLEARANCE_VAR}, 0px))`,
        }}
        mobileOffset={16}
        containerAriaLabel={labels.toastRegion}
        icons={{
          success: <ToastIcon tone="success" />,
          error: <ToastIcon tone="danger" />,
          info: <ToastIcon tone="info" />,
          warning: <ToastIcon tone="warning" />,
        }}
        toastOptions={{
          unstyled: true,
          closeButtonAriaLabel: labels.toastClose,
          ...toastOptions,
          classNames: {
            toast: cn(
              "flex w-(--width) items-center gap-3 rounded-md bg-surface-raised py-3 pr-3 pl-3.5 text-fg",
              "shadow-3 ring-1 ring-line",
            ),
            icon: "flex size-8 shrink-0 items-center justify-center rounded-full [&>svg]:size-5",
            content: "flex min-w-0 flex-1 flex-col",
            title: "text-label text-fg",
            // A second line, when there is one, never holds a lone word.
            description: "text-body-sm text-pretty text-fg-muted",
            actionButton: cn(
              "relative -my-1 inline-flex h-8 shrink-0 items-center rounded-full px-3 text-label text-accent",
              "transition-colors hover:bg-state-hover active:bg-state-pressed",
              "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5",
            ),
            cancelButton:
              "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-label text-fg-muted hover:bg-state-hover",
            closeButton: cn(
              "relative order-last -my-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted",
              "transition-colors hover:bg-state-hover hover:text-fg active:bg-state-pressed [&>svg]:size-4",
              "pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
            ),
            // The soft circle takes the kind's tone.
            success: "[&_[data-icon]]:bg-success-soft [&_[data-icon]]:text-success",
            error: "[&_[data-icon]]:bg-danger-soft [&_[data-icon]]:text-danger",
            info: "[&_[data-icon]]:bg-info-soft [&_[data-icon]]:text-info",
            warning: "[&_[data-icon]]:bg-warning-soft [&_[data-icon]]:text-warning",
            ...toastOptions?.classNames,
          },
        }}
        {...props}
      />
      <ErrorAnnouncer />
    </>
  );
}

export interface ToastActionOptions {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  description?: string;
  /** One action button on the toast ("Lihat", "Urungkan"). */
  action?: ToastActionOptions;
}

// Arrow-function-typed properties, not method shorthand (`error(...): void`):
// callers tear these off the object often (`const { error } = useToast()`,
// or a react-query MutationCache default importing `toast` directly), and
// method shorthand would make every one of those sites trip
// @typescript-eslint/unbound-method for a `this` binding these functions
// never actually use.
export interface ToastApi {
  success: (message: string, options?: ToastOptions) => string | number;
  /** `retry` is the action a failed request offers; `action` works too. */
  error: (
    message: string,
    options?: ToastOptions & { retry?: ToastActionOptions },
  ) => string | number;
  info: (message: string, options?: ToastOptions) => string | number;
  warning: (message: string, options?: ToastOptions) => string | number;
  dismiss: (id?: string | number) => void;
}

function sonnerOptions(options: ToastOptions | undefined, action?: ToastActionOptions) {
  const chosen = action ?? options?.action;
  return {
    description: options?.description,
    action: chosen ? { label: chosen.label, onClick: chosen.onClick } : undefined,
  };
}

/**
 * Thin wrapper over sonner so call sites don't import it directly (keeps
 * the toast implementation swappable, and centralizes the "error keeps a
 * retry action" convention from docs/05-shared-components.md). Plain
 * functions, not hooks -- despite the `useToast` name kept for existing
 * call sites, nothing here reads React state, so `toast` below is safe to
 * call from outside a component (e.g. a react-query `MutationCache`
 * default, which cannot call hooks at all). Each returns the toast's id,
 * for `dismiss`.
 */
export const toast: ToastApi = {
  success: (message, options) => sonnerToast.success(message, sonnerOptions(options)),
  error: (message, options) => {
    const id = sonnerToast.error(message, {
      ...sonnerOptions(options, options?.retry),
      duration: ERROR_DURATION_MS,
      // An error stays longer, so it can also be put away by hand.
      closeButton: true,
    });
    announceError?.([message, options?.description].filter(Boolean).join(". "));
    return id;
  },
  info: (message, options) => sonnerToast.info(message, sonnerOptions(options)),
  warning: (message, options) => sonnerToast.warning(message, sonnerOptions(options)),
  dismiss: (id) => {
    sonnerToast.dismiss(id);
  },
};

export function useToast(): ToastApi {
  return toast;
}
