import { homeroomDutyTopics } from "@/lib/api/hooks/review";
import type { Duty } from "@/lib/api/types";

/**
 * Unit-tests the pure homeroom-topic derivation used by useLeaveReviewQueue
 * (docs/analysis/realtime-plan-2026-09-25.md chunk E, section 4.4 row 7:
 * one `duty:homeroom:<classID>` topic per class a teacher is homeroom of).
 * The hook itself (a thin useLiveTopics/useLiveInvalidate wrapper around
 * useQuery) is not unit-tested here: this repo has no React render harness
 * for mobile (see realtime-connection.test.ts's own doc comment on why
 * RealtimeConnection is a plain class for exactly this reason), and the
 * underlying subscribe/invalidate mechanics are already covered by
 * realtime-connection.test.ts.
 */
function duty(slug: string, scopeId?: string): Duty {
  return { slug, scope_kind: scopeId ? "class" : "school", scope_id: scopeId };
}

describe("homeroomDutyTopics", () => {
  it("returns one duty:homeroom:<classID> topic per homeroom class", () => {
    const duties = [duty("homeroom", "class-1"), duty("homeroom", "class-2"), duty("counselor")];
    expect(homeroomDutyTopics(duties)).toEqual(["duty:homeroom:class-1", "duty:homeroom:class-2"]);
  });

  it("ignores non-homeroom duties and a homeroom duty with no scope id", () => {
    const duties: Duty[] = [
      duty("counselor"),
      duty("picket"),
      { slug: "homeroom", scope_kind: "class" },
    ];
    expect(homeroomDutyTopics(duties)).toEqual([]);
  });

  it("returns an empty list for no duties at all", () => {
    expect(homeroomDutyTopics(undefined)).toEqual([]);
    expect(homeroomDutyTopics([])).toEqual([]);
  });
});
