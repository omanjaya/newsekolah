import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const locale = vi.hoisted(() => ({ value: "id" }));

vi.mock("next-intl", () => ({
  useLocale: () => locale.value,
  useTranslations: () =>
    Object.assign(
      (key: string, params?: Record<string, unknown>) => `${key} ${JSON.stringify(params ?? {})}`,
      { has: () => true },
    ),
}));

import type { RiskReason } from "../api";

import { useReasonText } from "./reason-text";

// The params apps/api/internal/modules/analytics/domain/analytics.go Score
// sends with a grade drop.
const reason: RiskReason = {
  code: "grade_drop_watch",
  weight: 10,
  params: { previous_average: 81.24, current_average: 78.46 },
};

describe("useReasonText", () => {
  it("writes the averages at the scale's precision with the Indonesian decimal comma", () => {
    locale.value = "id";
    const { result } = renderHook(() => useReasonText(2));
    expect(result.current(reason)).toBe(
      'grade_drop_watch {"previous_average":"81,24","current_average":"78,46"}',
    );
  });

  it("writes them with a decimal point in English", () => {
    locale.value = "en";
    const { result } = renderHook(() => useReasonText(2));
    expect(result.current(reason)).toBe(
      'grade_drop_watch {"previous_average":"81.24","current_average":"78.46"}',
    );
  });

  // r4v-grades-discipline-R1: the profile rounded averages to one decimal
  // whatever the school's scale kept, so 55.08 read 55,1 beside a
  // gradebook showing 55,08.
  it("follows a school whose scale keeps one decimal", () => {
    locale.value = "id";
    const { result } = renderHook(() => useReasonText(1));
    expect(result.current(reason)).toBe(
      'grade_drop_watch {"previous_average":"81,2","current_average":"78,5"}',
    );
  });

  it("writes a whole average as a score and leaves counts as they are", () => {
    locale.value = "id";
    const { result } = renderHook(() => useReasonText(2));
    expect(
      result.current({
        code: "grade_drop_at_risk",
        weight: 20,
        params: { previous_average: 80, current_average: 70 },
      }),
    ).toBe('grade_drop_at_risk {"previous_average":"80,0","current_average":"70,0"}');
    expect(
      result.current({
        code: "attendance_absence_watch",
        weight: 10,
        params: { absent_days: 3, considered_days: 20 },
      }),
    ).toBe('attendance_absence_watch {"absent_days":3,"considered_days":20}');
  });
});
