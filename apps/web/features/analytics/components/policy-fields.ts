import type { FeatureModule } from "../../../lib/modules/feature-modules";
import type { EarlyWarningPolicy } from "../api";

export type PolicyField = Exclude<keyof EarlyWarningPolicy, "version">;

/** Every tunable field of the early-warning policy, in form order. */
export const POLICY_FIELDS: PolicyField[] = [
  "window_days",
  "attendance_watch_rate",
  "attendance_at_risk_rate",
  "discipline_watch_points",
  "discipline_at_risk_points",
  "warning_letter_watch_count",
  "warning_letter_at_risk_count",
  "grade_drop_watch_points",
  "grade_drop_at_risk_points",
  "attendance_weight",
  "discipline_weight",
  "warning_weight",
  "grade_weight",
  "watch_score",
  "at_risk_score",
];

/**
 * The toggleable module whose signal each field tunes. A field of a
 * switched-off module is hidden; its saved value is kept and sent back
 * unchanged, ready for when the module is back on.
 */
const FIELD_MODULE: Partial<Record<PolicyField, FeatureModule>> = {
  discipline_watch_points: "discipline",
  discipline_at_risk_points: "discipline",
  warning_letter_watch_count: "discipline",
  warning_letter_at_risk_count: "discipline",
  discipline_weight: "discipline",
  warning_weight: "discipline",
  grade_drop_watch_points: "grading",
  grade_drop_at_risk_points: "grading",
  grade_weight: "grading",
};

/** The policy fields shown to the school: those of always-on or switched-on signals. */
export function visiblePolicyFields(isEnabled: (module: FeatureModule) => boolean): PolicyField[] {
  return POLICY_FIELDS.filter((key) => {
    const module = FIELD_MODULE[key];
    return !module || isEnabled(module);
  });
}
