import type { RowActionsMenuItem } from "@newsekolah/ui";
import { Pencil, Trash2 } from "lucide-react";

import type { ScheduleBlock } from "../api";
import { blockLockedReasonKey } from "../block-policy";

/**
 * A lesson block's edit and delete menu items. A block with attendance or
 * substitution history stays editable: the dialogs ask from which date the
 * change takes effect. A block that has ended can no longer change, so
 * both items are disabled and their labels say why, instead of opening a
 * form that can only fail on save.
 */
export function lockableBlockActions(
  block: ScheduleBlock,
  t: (key: string) => string,
  handlers: { onEdit: (block: ScheduleBlock) => void; onDelete: (block: ScheduleBlock) => void },
): RowActionsMenuItem[] {
  const lockedKey = blockLockedReasonKey(block);
  const locked = lockedKey !== undefined;
  const reason = lockedKey ? ` (${t(lockedKey)})` : "";
  return [
    {
      label: `${t("editBlock")}${reason}`,
      icon: <Pencil />,
      disabled: locked,
      onClick: () => {
        handlers.onEdit(block);
      },
    },
    {
      label: `${t("deleteBlock")}${reason}`,
      icon: <Trash2 />,
      tone: "danger",
      disabled: locked,
      onClick: () => {
        handlers.onDelete(block);
      },
    },
  ];
}
