"use client";

import { TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

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

/** What the dialog says: kept while it animates out. */
interface ConfirmContent {
  title: string;
  description: ReactNode;
  confirmLabel: string | undefined;
  cancelLabel: string | undefined;
  danger: boolean;
}

/**
 * A confirmation is reserved for actions that cannot be undone (see
 * docs/07-ui-ux.md section 5); anything reversible should use an inline
 * undo instead of interrupting the user with a dialog. A small dialog on a
 * tablet and up, a bottom sheet with full-width buttons on a phone.
 *
 * Callers usually clear the object the dialog is about as it closes
 * (`pendingDelete` back to null), which would blank its title and body
 * while it fades out. So the dialog keeps what it said when the reader
 * cancelled, dismissed or confirmed it, and shows that until it is gone.
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
  const current: ConfirmContent = {
    title,
    description,
    confirmLabel,
    cancelLabel,
    danger: (tone ?? (destructive ? "danger" : "default")) === "danger",
  };
  const [held, setHeld] = useState<ConfirmContent | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  // Adjusting state while rendering: a dialog that opens again speaks of
  // its new object, never of the one it last closed on.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setHeld(null);
  }
  const shown = open || held === null ? current : held;
  const { danger } = shown;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // While the action runs, Escape and the scrim do nothing: the
        // outcome would otherwise land on a dialog that is gone.
        if (confirming && !next) return;
        if (!next) setHeld(current);
        onOpenChange(next);
      }}
    >
      <DialogContent
        size="sm"
        // Like Cancel, the close button would do nothing while it runs.
        closeDisabled={confirming}
        title={shown.title}
        description={typeof shown.description === "string" ? shown.description : undefined}
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
                {shown.cancelLabel ?? labels.confirmDialogCancel}
              </Button>
            </DialogClose>
            <Button
              variant={danger ? "danger" : "primary"}
              loading={confirming}
              onClick={() => {
                setHeld(current);
                void onConfirm();
              }}
            >
              {shown.confirmLabel ?? labels.confirmDialogConfirm}
            </Button>
          </>
        }
      >
        {typeof shown.description !== "string" ? shown.description : null}
      </DialogContent>
    </Dialog>
  );
}
