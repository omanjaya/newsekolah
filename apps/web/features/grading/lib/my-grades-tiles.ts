import type { StatTileTone } from "@newsekolah/ui";
import { BarChart3, CheckCircle2, Sparkles, type LucideIcon } from "lucide-react";

import type { MySubjectGrade } from "../api";

/**
 * A subject's own KKTP, for the subject-level tuntas badge: the first
 * component that carries one (components are already in entry order --
 * see `subjectTrend` in `my-grades-view.tsx` for the same "array order is
 * entry order" assumption), falling back to the tenant's `default_kktp`
 * when none of this subject's components have their own.
 */
export function subjectEffectiveKktp(subject: MySubjectGrade, defaultKktp: number): number {
  const withKktp = subject.components.find((c) => c.kktp !== undefined);
  return withKktp?.kktp ?? defaultKktp;
}

/**
 * Whether this subject's best-known score (the published report score,
 * falling back to the live average) is at or above its KKTP. `undefined`
 * when the subject has no score yet -- a subject with nothing published
 * is neither tuntas nor "belum tuntas", just not gradeable yet.
 */
export function isSubjectTuntas(subject: MySubjectGrade, defaultKktp: number): boolean | undefined {
  const score = subject.report_score ?? subject.average;
  if (score === undefined) return undefined;
  return score >= subjectEffectiveKktp(subject, defaultKktp);
}

/** The student's overall average across every subject that already has one. */
export function myGradesOverallAverage(subjects: MySubjectGrade[]): number | undefined {
  const scored = subjects.flatMap((s) => s.report_score ?? s.average ?? []);
  if (scored.length === 0) return undefined;
  return scored.reduce((sum, score) => sum + score, 0) / scored.length;
}

/** How many subjects are tuntas against their own KKTP. */
export function countTuntasSubjects(subjects: MySubjectGrade[], defaultKktp: number): number {
  return subjects.filter((s) => isSubjectTuntas(s, defaultKktp) === true).length;
}

/**
 * How many individual component scores exist across every subject this
 * term -- the "nilai baru" tile. There is no server-side "seen/unseen"
 * flag on a score (`MyComponentScore` has none, see
 * `packages/api-client/src/gen/schema.d.ts`), so this counts every scored
 * component for the term currently on screen rather than fabricating a
 * notion of "since last visit": every score for the term picked is new in
 * the sense that it did not exist before this term's teaching started.
 */
export function countScoredComponents(subjects: MySubjectGrade[]): number {
  return subjects.reduce((total, s) => total + s.components.length, 0);
}

export interface MyGradesTile {
  key: string;
  icon: LucideIcon;
  tone: StatTileTone;
  value: string;
  /** `app.grading.myGrades.*` message key for the tile's label. */
  labelKey: string;
}

/** The student's own grades page stat-tile row (docs/07-ui-ux.md bento header). */
export function buildMyGradesTiles(
  subjects: MySubjectGrade[],
  defaultKktp: number,
): MyGradesTile[] {
  const average = myGradesOverallAverage(subjects);
  return [
    {
      key: "average",
      icon: BarChart3,
      tone: "blue",
      value: average === undefined ? "-" : average.toFixed(1),
      labelKey: "statAverage",
    },
    {
      key: "tuntas",
      icon: CheckCircle2,
      tone: "green",
      value: String(countTuntasSubjects(subjects, defaultKktp)),
      labelKey: "statTuntas",
    },
    {
      key: "newScores",
      icon: Sparkles,
      tone: "purple",
      value: String(countScoredComponents(subjects)),
      labelKey: "statNewScores",
    },
  ];
}
