import { statusNames, type StatusName } from "@newsekolah/ui-tokens/dist/tokens.ts";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export type { StatusName };

const STATUS_CLASS: Record<StatusName, string> = {
  present: "text-status-present",
  sick: "text-status-sick",
  excused: "text-status-excused",
  dispensation: "text-status-dispensation",
  absent: "text-status-absent",
  late: "text-status-late",
};

export interface StatusBadgeProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  status: StatusName;
  /** Overrides the default Indonesian label (e.g. for @newsekolah/i18n's "en" catalog). */
  label?: string;
}

/**
 * Maps a status code to its token color. Always renders a text label next
 * to the dot, never color alone, per DESIGN.md ("selalu disertai label teks
 * atau ikon") and antislop-human's color-only-feedback rule.
 */
export function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", className)}
      {...props}
    >
      <span
        className={cn("size-2 shrink-0 rounded-xs", STATUS_CLASS[status])}
        style={{ backgroundColor: "currentColor" }}
        aria-hidden="true"
      />
      <span className={STATUS_CLASS[status]}>{label ?? statusNames[status]}</span>
    </span>
  );
}
