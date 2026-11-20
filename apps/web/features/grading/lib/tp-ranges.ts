import { fromText } from "./number-text";

/** The R (Remedial) and T (Tuntas) bounds of one TP mapping row, as typed. */
export interface TPRangeText {
  r_min: string;
  r_max: string;
  t_min: string;
  t_max: string;
}

/**
 * Why a row's ranges cannot be saved, mirroring the API's ValidateTPMapping
 * (apps/api/internal/modules/grading/domain/grading.go) so the teacher is
 * told which rule failed before a request is sent:
 * - `incomplete`: a bound is empty;
 * - `invalid`: a range is reversed or leaves the school's scale;
 * - `overlap`: R and T share a score, which would then be both.
 */
export type TPRangeProblem = "incomplete" | "invalid" | "overlap";

export function tpRangeProblem(
  row: TPRangeText,
  scale: { min: number; max: number },
): TPRangeProblem | null {
  const rMin = fromText(row.r_min);
  const rMax = fromText(row.r_max);
  const tMin = fromText(row.t_min);
  const tMax = fromText(row.t_max);
  if (rMin === null || rMax === null || tMin === null || tMax === null) return "incomplete";
  const inScale = (min: number, max: number) => min >= scale.min && max <= scale.max && min <= max;
  if (!inScale(rMin, rMax) || !inScale(tMin, tMax)) return "invalid";
  if (rMin <= tMax && tMin <= rMax) return "overlap";
  return null;
}
