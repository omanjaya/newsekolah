import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../simulation/clock", () => ({
  useSimulation: () => undefined,
  // 2026-09-15T09:00 in Asia/Makassar (UTC+8).
  businessNow: () => new Date("2026-09-15T01:00:00Z"),
}));

import { useDateRangePresets } from "./use-date-range-presets";

describe("useDateRangePresets", () => {
  it("computes the four presets from businessNow in the tenant timezone", () => {
    const { result } = renderHook(() => useDateRangePresets());
    expect(result.current).toEqual([
      { label: "today", from: "2026-09-15", to: "2026-09-15" },
      { label: "last7Days", from: "2026-09-09", to: "2026-09-15" },
      { label: "thisMonth", from: "2026-09-01", to: "2026-09-15" },
      { label: "lastMonth", from: "2026-08-01", to: "2026-08-31" },
    ]);
  });
});
