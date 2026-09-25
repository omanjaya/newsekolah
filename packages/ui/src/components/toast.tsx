import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

export type ToasterProps = ComponentPropsWithoutRef<typeof SonnerToaster>;

/** Errors stay up long enough to actually read (docs/07-ui-ux.md), but are
 * still dismissible early via the close button -- never fully blocking. */
const ERROR_DURATION_MS = 8000;

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

/**
 * Mount once at the app root. `visibleToasts={3}` matches
 * docs/05-shared-components.md ("tidak menumpuk lebih dari 3"). Icons and
 * per-type colors come from Lucide plus the same `status-*` tokens
 * `Alert`/`Button`'s `danger` variant use, so a toast reads as the same
 * "system" as the rest of the UI rather than sonner's own default palette.
 */
export function Toaster(props: ToasterProps) {
  return (
    <>
      <SonnerToaster
        visibleToasts={3}
        gap={8}
        closeButton
        icons={{
          success: <CheckCircle2 className="size-4" aria-hidden="true" />,
          error: <AlertCircle className="size-4" aria-hidden="true" />,
          info: <Info className="size-4" aria-hidden="true" />,
        }}
        toastOptions={{
          classNames: {
            toast:
              "rounded-sm border border-border bg-surface text-fg shadow-(--shadow-float) text-[13px]",
            title: "font-medium",
            description: "text-fg-muted",
            actionButton: "rounded-xs bg-accent text-accent-fg",
            cancelButton: "rounded-xs bg-bg text-fg",
            closeButton: "border-border bg-surface text-fg-muted",
            success: "border-status-present/40 [&_[data-icon]]:text-status-present",
            error: "border-status-absent/40 [&_[data-icon]]:text-status-absent",
            info: "[&_[data-icon]]:text-fg-muted",
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

// Arrow-function-typed properties, not method shorthand (`error(...): void`):
// callers tear these off the object often (`const { error } = useToast()`,
// or a react-query MutationCache default importing `toast` directly), and
// method shorthand would make every one of those sites trip
// @typescript-eslint/unbound-method for a `this` binding these functions
// never actually use.
export interface ToastApi {
  success: (message: string, options?: { description?: string }) => void;
  error: (message: string, options?: { description?: string; retry?: ToastActionOptions }) => void;
  info: (message: string, options?: { description?: string }) => void;
  dismiss: (id?: string | number) => void;
}

/**
 * Thin wrapper over sonner so call sites don't import it directly (keeps
 * the toast implementation swappable, and centralizes the "error keeps a
 * retry action" convention from docs/05-shared-components.md). Plain
 * functions, not hooks -- despite the `useToast` name kept for existing
 * call sites, nothing here reads React state, so `toast` below is safe to
 * call from outside a component (e.g. a react-query `MutationCache`
 * default, which cannot call hooks at all).
 */
export const toast: ToastApi = {
  success: (message, options) => {
    sonnerToast.success(message, options);
  },
  error: (message, options) => {
    sonnerToast.error(message, {
      description: options?.description,
      duration: ERROR_DURATION_MS,
      action: options?.retry
        ? { label: options.retry.label, onClick: options.retry.onClick }
        : undefined,
    });
    announceError?.([message, options?.description].filter(Boolean).join(". "));
  },
  info: (message, options) => {
    sonnerToast(message, options);
  },
  dismiss: (id) => {
    sonnerToast.dismiss(id);
  },
};

export function useToast(): ToastApi {
  return toast;
}
