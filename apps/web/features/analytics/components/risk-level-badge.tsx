import { Badge, type BadgeTone } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { RiskLevel } from "../api";

/** The semantic tone for each level: red at risk, amber to watch, green clear. */
export const RISK_LEVEL_TONE: Record<RiskLevel, BadgeTone> = {
  none: "success",
  watch: "warning",
  at_risk: "danger",
};

export interface RiskLevelBadgeProps {
  level: RiskLevel;
  label: string;
}

/**
 * A risk level as the shared status pill: a dot plus the label, never
 * colour alone, in the semantic tones every other status column uses.
 */
export function RiskLevelBadge({ level, label }: RiskLevelBadgeProps): ReactElement {
  return (
    <Badge tone={RISK_LEVEL_TONE[level]} dot>
      {label}
    </Badge>
  );
}
