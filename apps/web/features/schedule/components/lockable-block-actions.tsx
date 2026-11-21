import type { RowActionsMenuItem } from "@newsekolah/ui";
import { Pencil, Trash2 } from "lucide-react";

import type { ScheduleBlock } from "../api";
import type { BlockLock } from "../use-block-lock";

import { HoldPageIcon } from "./block-action";

/**
 * A lesson block's edit and delete menu items. A block with attendance or
 * substitution history stays editable: the dialogs ask from which date the
 * change takes effect. A locked block (`lock`, see `useBlockLock`: it has
 * ended, or every remaining lesson has history) can no longer change, so
 * both items are disabled and their labels say why, instead of opening a
 * form that can only fail on save. When one record holds it, an item
 * between them opens that record with its date (a request a schedule
 * manager can cancel there, or that day's attendance).
 */
export function lockableBlockActions(
  block: ScheduleBlock,
  lock: BlockLock | undefined,
  t: (key: string) => string,
  handlers: {
    onEdit: (block: ScheduleBlock) => void;
    onDelete: (block: ScheduleBlock) => void;
    onOpen: (href: string) => void;
  },
): RowActionsMenuItem[] {
  const locked = lock !== undefined;
  const reason = lock ? ` (${lock.shortReason})` : "";
  const link = lock?.link;
  const open: RowActionsMenuItem[] = link
    ? [
        {
          label: link.label,
          icon: <HoldPageIcon page={link.page} />,
          onClick: () => {
            handlers.onOpen(link.href);
          },
        },
      ]
    : [];
  return [
    {
      label: `${t("editBlock")}${reason}`,
      icon: <Pencil />,
      disabled: locked,
      onClick: () => {
        handlers.onEdit(block);
      },
    },
    ...open,
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
