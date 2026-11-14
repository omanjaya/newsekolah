import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import type { Me } from "../types";

import { useGateBlock } from "./gate";

const me = (disabled: string[] = []) =>
  ({ permissions: [], roles: [], duties: [], disabled_modules: disabled }) as unknown as Me;

describe("useGateBlock", () => {
  it("returns an empty block when inactive", () => {
    const { result } = renderHook(() => useGateBlock(me(), false));
    expect(result.current.hero).toBeUndefined();
  });

  it("opens the gate home on the scanner, with the visitor book beside it", () => {
    const { result } = renderHook(() => useGateBlock(me(), true));
    expect(result.current.hero?.action?.href).toBe("/scan");
    expect(result.current.hero?.secondaryAction?.href).toContain("/visitors/board");
  });

  it("leads with the visitor book when the school runs no permits", () => {
    const { result } = renderHook(() => useGateBlock(me(["permits"]), true));
    expect(result.current.hero?.action?.href).toContain("/visitors/board");
    expect(result.current.hero?.secondaryAction).toBeUndefined();
  });
});
