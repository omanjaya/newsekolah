"use client";

import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";

/**
 * `grading.published` -> `user:<tenant>:<student>`, one per active student
 * in the class (docs/analysis/realtime-plan-2026-09-25.md section 4.4 row
 * 17): the student's own grades view (plan section 2 row 10), which has no
 * live signal at all today. The base `user:<tenant>:<user>` topic is
 * auto-subscribed by LiveSocketProvider, so no useLiveTopic call is needed
 * here -- same as permits' "student's own status" queries.
 *
 * Invalidates every `["grading", "my-grades", ...]` variant (the term-
 * scoped key, see `gradingKeys.myGrades` in api.ts) rather than the exact
 * key for whichever `termId` the currently mounted screen happens to be
 * viewing: the published event's `term_id` may not be the one currently
 * selected, and TanStack Query's own prefix matching on a shorter key
 * invalidates every term variant already cached.
 */
export function useMyGradesLive(): void {
  useLiveInvalidate(["grading.published"], [["grading", "my-grades"]]);
}
