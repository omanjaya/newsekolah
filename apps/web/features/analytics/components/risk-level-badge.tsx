import { cn } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { RiskLevel } from "../api";

const LEVEL_CLASS: Record<RiskLevel, string> = {
  none: "text-status-present",
  watch: "text-status-sick",
  at_risk: "text-status-absent",
};

export interface RiskLevelBadgeProps {
  level: RiskLevel;
  label: string;
}

/**
 * Colors the level with the same dot-plus-label convention as attendance's
 * StatusBadge (packages/ui), reusing its status tokens rather than adding
 * new ones: never color alone, per DESIGN.md.
 */
export function RiskLevelBadge({ level, label }: RiskLevelBadgeProps): ReactElement {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", LEVEL_CLASS[level])}
    >
      <span
        className="size-2 shrink-0 rounded-xs"
        style={{ backgroundColor: "currentColor" }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
