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
  // The reason shows on hover as well as on focus: IconButton keeps a
  // button unavailable for a reason within the pointer's reach, and puts
  // the label before the reason in the tooltip itself.
  return (
    <IconButton
      icon={icon}
      aria-label={label}
      disabledReason={lockedReason}
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("text-fg-muted", !locked && (danger ? "hover:text-danger" : "hover:text-fg"))}
    />
  );
}
