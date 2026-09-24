import type { AssessmentComponent, GradebookStudent } from "../api";

/**
 * One student's scores merged with whatever is still only in the local
 * edit buffer, keyed by component id -- the same shape as
 * `GradebookStudent.scores`, used everywhere a "what does this student's
 * row look like right now" view is needed (live average, missing count)
 * instead of the last-saved snapshot alone.
 */
export function mergeStudentScores(
  student: GradebookStudent,
  edits: Record<string, Record<string, string>>,
): Record<string, number> {
  // `null` marks a component the student's edit just cleared (a blank
  // input): collected separately from the saved snapshot so it can
  // override that snapshot without a dynamic `delete`.
  const overrides = new Map<string, number | null>();
  for (const [componentId, byStudent] of Object.entries(edits)) {
    const draft = byStudent[student.student_user_id];
    if (draft === undefined) continue;
    const trimmed = draft.trim();
    if (trimmed === "") {
      overrides.set(componentId, null);
      continue;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) overrides.set(componentId, parsed);
  }

  const merged: Record<string, number> = {};
  for (const [componentId, score] of Object.entries(student.scores)) {
    if (overrides.has(componentId)) continue; // The edit buffer wins, whether it is a new value or a clear.
    merged[componentId] = score;
  }
  for (const [componentId, value] of overrides) {
    if (value !== null) merged[componentId] = value;
  }
  return merged;
}

/**
 * The weighted average of every graded component, mirroring
 * `apps/api/internal/modules/grading/domain/grading.go`'s `WeightedAverage`:
 * each scored component counts by its own weight, an ungraded component is
 * skipped rather than treated as zero. Runs over `mergeStudentScores`'s
 * output so the number on screen updates as a teacher types, ahead of
 * whatever the server last computed and saved.
 */
export function computeLiveAverage(
  components: AssessmentComponent[],
  scores: Record<string, number>,
): number | undefined {
  let sum = 0;
  let weight = 0;
  for (const component of components) {
    const score = scores[component.id];
    if (score === undefined) continue;
    sum += score * component.weight;
    weight += component.weight;
  }
  if (weight === 0) return undefined;
  return sum / weight;
}

/** How many of `components` this student has no score for yet (merged view). */
export function countMissingComponents(
  components: AssessmentComponent[],
  scores: Record<string, number>,
): number {
  let missing = 0;
  for (const component of components) {
    if (scores[component.id] === undefined) missing += 1;
  }
  return missing;
}

/** How many students in `students` are missing a score for this one component (merged view). */
export function countMissingForComponent(
  componentId: string,
  students: GradebookStudent[],
  edits: Record<string, Record<string, string>>,
): number {
  let missing = 0;
  for (const student of students) {
    const scores = mergeStudentScores(student, edits);
    if (scores[componentId] === undefined) missing += 1;
  }
  return missing;
}

/** True when `value` (a raw input string) parses to a number outside the tenant's grading scale. */
export function isScoreOutOfRange(value: string, min: number, max: number): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return true;
  return parsed < min || parsed > max;
}
