import { cn } from "@newsekolah/ui";
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
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-xs text-fg-muted hover:bg-surface",
        danger ? "hover:text-status-absent" : "hover:text-fg",
      )}
    >
      {icon}
    </button>
  );
}
