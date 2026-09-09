import type { ComponentPropsWithoutRef } from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

export type ToasterProps = ComponentPropsWithoutRef<typeof SonnerToaster>;

/**
 * Mount once at the app root. `visibleToasts={3}` matches
 * docs/05-shared-components.md ("tidak menumpuk lebih dari 3").
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      visibleToasts={3}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "rounded-sm border border-border bg-surface text-fg shadow-(--shadow-float) text-[13px]",
          title: "font-medium",
          description: "text-fg-muted",
          actionButton: "rounded-xs bg-accent text-accent-fg",
          cancelButton: "rounded-xs bg-bg text-fg",
        },
      }}
      {...props}
    />
  );
}

export interface ToastActionOptions {
  label: string;
  onClick: () => void;
}

/**
 * Thin wrapper over sonner so call sites don't import it directly (keeps
 * the toast implementation swappable, and centralizes the "error keeps a
 * retry action" convention from docs/05-shared-components.md).
 */
export function useToast() {
  return {
    success: (message: string, options?: { description?: string }) =>
      sonnerToast.success(message, options),
    error: (message: string, options?: { description?: string; retry?: ToastActionOptions }) =>
      sonnerToast.error(message, {
        description: options?.description,
        action: options?.retry
          ? { label: options.retry.label, onClick: options.retry.onClick }
          : undefined,
      }),
    info: (message: string, options?: { description?: string }) => sonnerToast(message, options),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  };
}
