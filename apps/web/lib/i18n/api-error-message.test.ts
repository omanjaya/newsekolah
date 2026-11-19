import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useApiErrorMessage } from "./api-error-message";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => `errors.${key}` }));

describe("useApiErrorMessage", () => {
  it("translates any code the shared errors catalog documents", () => {
    const { result } = renderHook(() => useApiErrorMessage());
    expect(result.current("LIBRARY_MEMBER_SUSPENDED")).toBe("errors.LIBRARY_MEMBER_SUSPENDED");
    expect(result.current("LIBRARY_NO_COPY_AVAILABLE")).toBe("errors.LIBRARY_NO_COPY_AVAILABLE");
  });

  it("falls back to the given text for an unknown code", () => {
    const { result } = renderHook(() => useApiErrorMessage());
    expect(result.current("SOME_FUTURE_CODE", "server text")).toBe("server text");
  });

  it("falls back to errors.UNKNOWN for an unknown code without fallback", () => {
    const { result } = renderHook(() => useApiErrorMessage());
    expect(result.current("SOME_FUTURE_CODE")).toBe("errors.UNKNOWN");
  });
});
