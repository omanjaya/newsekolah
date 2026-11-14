import { IconButton, cn } from "@newsekolah/ui";
import type { ReactElement } from "react";

/** One icon control on a lesson block, labelled for anyone not seeing it. */
export function BlockAction({
  label,
  icon,
  danger,
  onClick,
}: {
  label: string;
  icon: ReactElement;
  danger?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <IconButton
      icon={icon}
      aria-label={label}
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("text-fg-muted", danger ? "hover:text-danger" : "hover:text-fg")}
    />
  );
}
