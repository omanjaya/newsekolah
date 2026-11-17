import type { Incident } from "../api";

/**
 * One signal per severity, shared by the log, the detail and the recap:
 * quiet for low, information for medium, warning for high, danger for
 * critical. Never the accent, which marks actions and good news.
 */
export const SEVERITY_VARIANT: Record<
  Incident["severity"],
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const SEVERITIES: Incident["severity"][] = ["low", "medium", "high", "critical"];
