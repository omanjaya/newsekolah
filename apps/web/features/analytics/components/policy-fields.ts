import type { FeatureModule } from "../../../lib/modules/feature-modules";
import type { EarlyWarningPolicy } from "../api";

export type PolicyField = Exclude<keyof EarlyWarningPolicy, "version">;

export type PolicyGroupId =
  "window" | "attendance" | "discipline" | "warningLetter" | "gradeDrop" | "weights" | "totalScore";

export interface PolicyGroup {
  id: PolicyGroupId;
  fields: PolicyField[];
}

/**
 * The policy form's sections, in form order. Each signal's watch and
 * at-risk thresholds share a section, so the pair reads side by side
 * instead of straddling rows of one flat grid.
 */
export const POLICY_GROUPS: PolicyGroup[] = [
  { id: "window", fields: ["window_days"] },
  { id: "attendance", fields: ["attendance_watch_rate", "attendance_at_risk_rate"] },
  { id: "discipline", fields: ["discipline_watch_points", "discipline_at_risk_points"] },
  { id: "warningLetter", fields: ["warning_letter_watch_count", "warning_letter_at_risk_count"] },
  { id: "gradeDrop", fields: ["grade_drop_watch_points", "grade_drop_at_risk_points"] },
  {
    id: "weights",
    fields: ["attendance_weight", "discipline_weight", "warning_weight", "grade_weight"],
  },
  { id: "totalScore", fields: ["watch_score", "at_risk_score"] },
];

/** Every tunable field of the early-warning policy, in form order. */
export const POLICY_FIELDS: PolicyField[] = POLICY_GROUPS.flatMap((group) => group.fields);

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

/** The form's sections with only their visible fields; a section left empty is dropped. */
export function visiblePolicyGroups(isEnabled: (module: FeatureModule) => boolean): PolicyGroup[] {
  const shown = new Set(visiblePolicyFields(isEnabled));
  return POLICY_GROUPS.map((group) => ({
    ...group,
    fields: group.fields.filter((key) => shown.has(key)),
  })).filter((group) => group.fields.length > 0);
}
