import type { RowActionsMenuItem } from "@newsekolah/ui";
import { Pencil, Trash2 } from "lucide-react";

import type { ScheduleBlock } from "../api";

/**
 * A lesson block's edit and delete menu items. A block with attendance or
 * substitution history can no longer be changed (the API refuses it to
 * keep the history), so both items are disabled and their labels say why,
 * instead of opening a form that can only fail on save.
 */
export function lockableBlockActions(
  block: ScheduleBlock,
  t: (key: string) => string,
  handlers: { onEdit: (block: ScheduleBlock) => void; onDelete: (block: ScheduleBlock) => void },
): RowActionsMenuItem[] {
  const locked = Boolean(block.has_history);
  return [
    {
      label: locked ? t("editBlockLocked") : t("editBlock"),
      icon: <Pencil />,
      disabled: locked,
      onClick: () => {
        handlers.onEdit(block);
      },
    },
    {
      label: locked ? t("deleteBlockLocked") : t("deleteBlock"),
      icon: <Trash2 />,
      tone: "danger",
      disabled: locked,
      onClick: () => {
        handlers.onDelete(block);
      },
    },
  ];
}
