import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCycleTrail } from "./use-cycle-trail";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

describe("useCycleTrail", () => {
  it("names the root as the cycle list's h1, not as its tab", () => {
    const { result } = renderHook(() => useCycleTrail());
    expect(result.current.root).toEqual({ label: "navGroupLabel", href: "/supervision/cycles" });
  });

  it("gives both of a cycle's tabs the same two-level trail", () => {
    const { result } = renderHook(() => useCycleTrail());
    expect(result.current.cycle("Semester ganjil")).toEqual([
      { label: "navGroupLabel", href: "/supervision/cycles" },
      { label: "Semester ganjil" },
    ]);
  });

  it("walks a teacher's report back through the cycle and its results", () => {
    const { result } = renderHook(() => useCycleTrail());
    const trail = result.current;
    expect(trail.within("c1", "Semester ganjil", trail.results("c1"), { label: "Guru" })).toEqual([
      { label: "navGroupLabel", href: "/supervision/cycles" },
      { label: "Semester ganjil", href: "/supervision/cycles/c1" },
      { label: "cycleReport.breadcrumb", href: "/supervision/cycles/c1/report" },
      { label: "Guru" },
    ]);
  });
});
