import { IconButton, cn } from "@newsekolah/ui";
import type { ReactElement } from "react";

/**
 * One icon control on a lesson block, labelled for anyone not seeing it.
 * With `lockedReason` the control stays visible and focusable but does
 * nothing, and its tooltip says why (a block with attendance history can
 * no longer be edited or deleted), instead of opening a form that can only
 * fail on save.
 */
export function BlockAction({
  label,
  icon,
  danger,
  onClick,
  lockedReason,
}: {
  label: string;
  icon: ReactElement;
  danger?: boolean;
  onClick: () => void;
  lockedReason?: string;
}): ReactElement {
  const locked = lockedReason !== undefined;
  return (
    <IconButton
      icon={icon}
      aria-label={locked ? `${label}: ${lockedReason}` : label}
      aria-disabled={locked || undefined}
      variant="ghost"
      size="sm"
      onClick={locked ? undefined : onClick}
      className={cn(
        "text-fg-muted",
        locked ? "cursor-not-allowed opacity-50" : danger ? "hover:text-danger" : "hover:text-fg",
      )}
    />
  );
}
