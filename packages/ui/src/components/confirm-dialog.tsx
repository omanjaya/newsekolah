import type { ReactNode } from "react";

import { Button } from "./button.js";
import { Dialog, DialogClose, DialogContent } from "./dialog.js";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Names the object and the impact of the action, per docs/07-ui-ux.md section 5. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  /** Renders the confirm button as `variant="danger"` for destructive actions. */
  destructive?: boolean;
  confirming?: boolean;
}

/**
 * A confirmation is reserved for actions that cannot be undone (see
 * docs/07-ui-ux.md section 5); anything reversible should use an inline
 * undo instead of interrupting the user with a dialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  onConfirm,
  destructive,
  confirming,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={typeof description === "string" ? description : undefined}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                {cancelLabel}
              </Button>
            </DialogClose>
            <Button
              variant={destructive ? "danger" : "primary"}
              size="sm"
              loading={confirming}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {typeof description !== "string" ? description : null}
      </DialogContent>
    </Dialog>
  );
}
