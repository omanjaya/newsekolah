import { statusNames, type StatusName } from "@newsekolah/ui-tokens/dist/tokens.ts";
import type { ComponentPropsWithRef } from "react";

import { cn } from "../utils/cn.js";

import { Badge, type BadgeAppearance, type BadgeSize } from "./badge.js";

export type { StatusName };

// The attendance palette appears only as the dot: `late` and `sick` are
// two different oranges, too close to tell apart as tinted fills, and the
// label carries the meaning anyway.
const STATUS_DOT_CLASS: Record<StatusName, string> = {
  present: "bg-status-present",
  sick: "bg-status-sick",
  excused: "bg-status-excused",
  dispensation: "bg-status-dispensation",
  absent: "bg-status-absent",
  late: "bg-status-late",
};

export interface StatusBadgeProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  status: StatusName;
  /** Overrides the default Indonesian label (e.g. for @newsekolah/i18n's "en" catalog). */
  label?: string;
  size?: BadgeSize;
  /** `soft` (default) or `outline`; a solid fill is not offered for attendance. */
  appearance?: Exclude<BadgeAppearance, "solid">;
}

/**
 * An attendance status as a pill with a dot in its token colour. Always a
 * text label next to the colour, never colour alone (docs/07-ui-ux.md
 * section 6), and the same pill shape as every other status in the product.
 */
export function StatusBadge({
  status,
  label,
  size,
  appearance = "soft",
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      tone="neutral"
      appearance={appearance}
      size={size}
      dot
      dotClassName={STATUS_DOT_CLASS[status]}
      data-status={status}
      className={cn("text-fg", className)}
      {...props}
    >
      {label ?? statusNames[status]}
    </Badge>
  );
}
