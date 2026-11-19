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

const reason: RiskReason = {
  code: "grade_drop",
  weight: 10,
  params: { previous: 81.24, current: 78.46, drop: 3 },
};

describe("useReasonText", () => {
  it("writes a fractional average with the Indonesian decimal comma", () => {
    locale.value = "id";
    const { result } = renderHook(() => useReasonText());
    expect(result.current(reason)).toBe('grade_drop {"previous":"81,2","current":"78,5","drop":3}');
  });

  it("writes it with a decimal point in English", () => {
    locale.value = "en";
    const { result } = renderHook(() => useReasonText());
    expect(result.current(reason)).toBe('grade_drop {"previous":"81.2","current":"78.5","drop":3}');
  });
});
