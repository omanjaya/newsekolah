import type { AssessmentComponent, GradebookStudent } from "../api";
import type { Edits } from "../components/gradebook-types";

/** A score typed or pasted into a cell: one optional decimal separator, "," or ".". */
const SCORE_TEXT = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * Reads what a teacher typed or pasted into a score cell. A blank cell is
 * `null` (no score, or a score being cleared); a number may use either a
 * comma (as Indonesian spreadsheets copy it, "78,5") or a point as its
 * decimal separator. Anything else -- letters, a thousands separator as in
 * "1.234,5", two separators -- is "invalid" rather than guessed at, so it
 * is flagged instead of being saved as a different number.
 */
export function parseScoreInput(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!SCORE_TEXT.test(trimmed)) return "invalid";
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "invalid";
}

/**
 * `prev` with one cell's edit set to `value`, or dropped when `value` reads
 * as the score already saved (`original`, undefined for none): typing a
 * score back, or clearing a cell that was empty, leaves nothing pending.
 * A column whose last edit is dropped is removed from the result.
 */
export function withCellEdit(
  prev: Edits,
  componentId: string,
  studentId: string,
  value: string,
  original: number | undefined,
): Edits {
  const parsed = parseScoreInput(value);
  const unchanged = parsed === null ? original === undefined : parsed === original;
  const column = prev[componentId] ?? {};
  if (!unchanged) return { ...prev, [componentId]: { ...column, [studentId]: value } };
  if (!(studentId in column)) return prev;
  const rest = Object.fromEntries(Object.entries(column).filter(([id]) => id !== studentId));
  // A column left with no edits is dropped too, so `edits` (and the draft
  // mirrored from it) never holds an empty column object.
  if (Object.keys(rest).length > 0) return { ...prev, [componentId]: rest };
  return Object.fromEntries(Object.entries(prev).filter(([id]) => id !== componentId));
}

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
    const parsed = parseScoreInput(draft);
    if (parsed !== "invalid") overrides.set(componentId, parsed);
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

/** Why a cell's raw input cannot be saved: not a number at all, or outside the scale. */
export type ScoreProblem = "format" | "range";

/** The problem with `value` (a raw input string), or null when it is blank or a score within the scale. */
export function scoreProblem(value: string, min: number, max: number): ScoreProblem | null {
  const parsed = parseScoreInput(value);
  if (parsed === null) return null;
  if (parsed === "invalid") return "format";
  return parsed < min || parsed > max ? "range" : null;
}

/** True when `value` (a raw input string) cannot be saved: not a number, or outside the tenant's grading scale. */
export function isScoreOutOfRange(value: string, min: number, max: number): boolean {
  return scoreProblem(value, min, max) !== null;
}
