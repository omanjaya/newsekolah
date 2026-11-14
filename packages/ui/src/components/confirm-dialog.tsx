"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button.js";
import { Dialog, DialogClose, DialogContent } from "./dialog.js";
import { useUiLabels } from "./ui-labels.js";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Names the object and the impact of the action, per docs/07-ui-ux.md section 5. */
  description?: ReactNode;
  /** Defaults to `UiLabels.confirmDialogConfirm`. */
  confirmLabel?: string;
  /** Defaults to `UiLabels.confirmDialogCancel`. */
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  /**
   * "danger" for an action that destroys or removes something: a warning
   * icon in a soft danger circle and a danger confirm button.
   */
  tone?: "default" | "danger";
  /** The older spelling of `tone="danger"`, still honoured; new code uses `tone`. */
  destructive?: boolean;
  /** The action is running: the confirm button spins and the dialog cannot be dismissed. */
  confirming?: boolean;
}

/**
 * A confirmation is reserved for actions that cannot be undone (see
 * docs/07-ui-ux.md section 5); anything reversible should use an inline
 * undo instead of interrupting the user with a dialog. A small dialog on a
 * tablet and up, a bottom sheet with full-width buttons on a phone.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone,
  destructive,
  confirming,
}: ConfirmDialogProps) {
  const labels = useUiLabels();
  const danger = (tone ?? (destructive ? "danger" : "default")) === "danger";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // While the action runs, Escape and the scrim do nothing: the
        // outcome would otherwise land on a dialog that is gone.
        if (!confirming || next) onOpenChange(next);
      }}
    >
      <DialogContent
        size="sm"
        // Like Cancel, the close button would do nothing while it runs.
        closeDisabled={confirming}
        title={title}
        description={typeof description === "string" ? description : undefined}
        icon={
          danger ? (
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            >
              <TriangleAlert className="size-5" strokeWidth={2.2} />
            </span>
          ) : undefined
        }
        footer={
          <>
            <DialogClose asChild>
              {/* Focus opens on the way out, never on the action that cannot be undone. */}
              <Button variant="secondary" disabled={confirming} data-autofocus="">
                {cancelLabel ?? labels.confirmDialogCancel}
              </Button>
            </DialogClose>
            <Button
              variant={danger ? "danger" : "primary"}
              loading={confirming}
              onClick={() => void onConfirm()}
            >
              {confirmLabel ?? labels.confirmDialogConfirm}
            </Button>
          </>
        }
      >
        {typeof description !== "string" ? description : null}
      </DialogContent>
    </Dialog>
  );
}
