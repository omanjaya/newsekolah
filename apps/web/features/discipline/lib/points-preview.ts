import type { SPPolicy } from "../api";
import type { PointsPreviewEntry } from "../api-violation-extras";

/**
 * One student's live points preview row: current total, the points about
 * to be added by the violation types selected so far, the resulting
 * total, and any warning-letter levels this action would newly reach.
 * Mirrors the server's `SPPolicy.DueLevels`
 * (apps/api/internal/modules/discipline/domain/discipline.go) purely
 * client-side, the same way `lib/gradebook-scores.ts`'s
 * `computeLiveAverage` mirrors `WeightedAverage` -- the server only sends
 * each student's current total and already-issued levels
 * (`usePointsPreviewQuery`); the points being added are already known
 * from the violation-type catalog the form already fetched.
 */
export interface PointsPreviewRow {
  studentUserId: string;
  currentPoints: number;
  addedPoints: number;
  newPoints: number;
  /** Levels this action would newly reach: not reached before, reached after, not already issued. */
  crossedLevels: SPPolicy["levels"];
}

export function computePointsPreview(
  entries: PointsPreviewEntry[],
  addedPoints: number,
  policy: SPPolicy | undefined,
): PointsPreviewRow[] {
  const levels = policy?.levels ?? [];
  return entries.map((entry) => {
    const newPoints = entry.total_points + addedPoints;
    const crossedLevels = levels
      .filter(
        (level) =>
          entry.total_points < level.min_points &&
          newPoints >= level.min_points &&
          !entry.issued_levels.includes(level.level),
      )
      .sort((a, b) => a.level - b.level);
    return {
      studentUserId: entry.student_user_id,
      currentPoints: entry.total_points,
      addedPoints,
      newPoints,
      crossedLevels,
    };
  });
}
