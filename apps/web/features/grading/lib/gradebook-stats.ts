import type { GradebookStudent } from "../api";

/**
 * How full the grid already is: filled score slots divided by the total
 * number of slots (every student times every component), as a rounded
 * percentage. Used both by the teaching-assignment bento card ("progress of
 * filled scores") and the entry page's "nilai terisi" tile -- same
 * definition in both places so the number does not appear to disagree with
 * itself across the screen. Zero components or zero students has no slots
 * to fill, so it reads as fully filled (100) rather than dividing by zero:
 * an empty sheet should not look like a half-finished one.
 */
export function gradebookFillPercentage(
  students: GradebookStudent[],
  componentCount: number,
): number {
  const totalSlots = students.length * componentCount;
  if (totalSlots === 0) return 100;
  let filled = 0;
  for (const student of students) {
    filled += Math.min(Object.keys(student.scores).length, componentCount);
  }
  return Math.round((filled / totalSlots) * 100);
}

/**
 * The class's average, from every student who already has a computed
 * `average` (a student with no scored component yet is left out rather
 * than counted as zero, mirroring `computeLiveAverage`'s own "skip the
 * ungraded" rule in `gradebook-scores.ts`). `undefined` when nobody in the
 * class has a score yet.
 */
export function gradebookClassAverage(students: GradebookStudent[]): number | undefined {
  const graded = students.filter((s) => s.average !== undefined);
  if (graded.length === 0) return undefined;
  const sum = graded.reduce((total, s) => total + (s.average ?? 0), 0);
  return sum / graded.length;
}

/**
 * One student's "tuntas" (passing) effective score and threshold, mirroring
 * the server's own precedence (`report_score` overrides the computed
 * `average` when present -- see `Gradebook`/`ReportScore` in
 * docs/05-shared-components.md's grading section) and `final_kktp` (the
 * student's resolved KKTP, falling back to the tenant's `default_kktp` when
 * the sheet has not resolved one). Returns `undefined` when the student has
 * no score at all yet -- "tuntas" is meaningless for a blank row.
 */
export function isStudentTuntas(
  student: GradebookStudent,
  defaultKktp: number,
): boolean | undefined {
  const score = student.report_score ?? student.average;
  if (score === undefined) return undefined;
  const threshold = student.final_kktp ?? defaultKktp;
  return score >= threshold;
}

/**
 * Share of the class that is "tuntas" (at or above its KKTP), out of every
 * student in the sheet -- a student with no score yet counts against the
 * rate (not excluded), since "belum dinilai" is itself a form of "not yet
 * tuntas" from the class's point of view. Rounded percentage; 0 for an
 * empty class rather than NaN.
 */
export function gradebookTuntasRate(students: GradebookStudent[], defaultKktp: number): number {
  if (students.length === 0) return 0;
  const tuntas = students.filter((s) => isStudentTuntas(s, defaultKktp) === true).length;
  return Math.round((tuntas / students.length) * 100);
}

/** How many students have not been scored on anything yet (no `average` computed). */
export function gradebookUngradedCount(students: GradebookStudent[]): number {
  return students.filter((s) => s.average === undefined).length;
}
