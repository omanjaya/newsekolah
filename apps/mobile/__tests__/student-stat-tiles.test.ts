import { computeAttendancePercent, computeGradedComponentsCount } from "@/lib/home/stat-tiles";
import type { CalendarDay, MySubjectGrade } from "@/lib/api/hooks";

function day(status_code: string): CalendarDay {
  return {
    date: "2026-09-01",
    status_code,
    expected_sessions: 1,
    submitted_sessions: 1,
    complete: true,
  };
}

describe("computeAttendancePercent", () => {
  it("returns undefined when every day is NONE (nothing recorded yet)", () => {
    expect(computeAttendancePercent([day("NONE"), day("NONE")])).toBeUndefined();
  });

  it("returns undefined for an empty month", () => {
    expect(computeAttendancePercent([])).toBeUndefined();
  });

  it("computes present / relevant days, rounded, ignoring NONE days", () => {
    // 3 present, 1 absent among 4 relevant days -> 75%; a NONE day is not counted.
    expect(computeAttendancePercent([day("H"), day("H"), day("H"), day("A"), day("NONE")])).toBe(
      75,
    );
  });

  it("is a real, honest 0% when every relevant day is absent (not hidden)", () => {
    expect(computeAttendancePercent([day("A"), day("A")])).toBe(0);
  });
});

describe("computeGradedComponentsCount", () => {
  function subject(componentCount: number): MySubjectGrade {
    return {
      subject_id: "subject-1",
      components: Array.from({ length: componentCount }, (_, i) => ({
        code: `UH${String(i + 1)}`,
        kind: "formative",
        score: 80,
      })),
    };
  }

  it("sums components across every subject", () => {
    expect(computeGradedComponentsCount([subject(2), subject(3)])).toBe(5);
  });

  it("is 0 for a term with no scored components yet (a real zero, not missing data)", () => {
    expect(computeGradedComponentsCount([subject(0)])).toBe(0);
    expect(computeGradedComponentsCount([])).toBe(0);
  });
});
