import type { SPCandidate, SPLevel } from "../api";

/**
 * Levels the student has reached but not yet been issued, ascending. The
 * API refuses issuing out of order, so only the first one is ever offered.
 */
export function dueLevels(candidate: SPCandidate, levels: SPLevel[]): SPLevel[] {
  return levels
    .filter(
      (level) =>
        candidate.total_points >= level.min_points &&
        !candidate.issued_levels.includes(level.level),
    )
    .sort((a, b) => a.level - b.level);
}
