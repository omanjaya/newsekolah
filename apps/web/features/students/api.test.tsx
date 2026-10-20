import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ GET: mocks.get }) }));

import { STUDENT_SEARCH_LIMIT, useStudentSearchQuery } from "./api";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useStudentSearchQuery", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockResolvedValue({
      data: [{ id: "s1", name: "Ani", username: "2301002", profile_kind: "student" }],
    });
  });

  it("asks the directory for a capped page of students and unwraps the rows", async () => {
    const { result } = renderHook(() => useStudentSearchQuery(" ani ", true), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });
    const [path, options] = mocks.get.mock.calls[0] as [
      string,
      { params: { query: unknown }; signal: AbortSignal },
    ];
    expect(path).toBe("/v1/directory/users");
    expect(options.params.query).toEqual({
      profile_kind: "student",
      q: "ani",
      limit: STUDENT_SEARCH_LIMIT,
    });
    // React Query aborts this signal when the term (query key) is superseded.
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not search below two characters", () => {
    renderHook(() => useStudentSearchQuery("a", true), { wrapper });
    renderHook(() => useStudentSearchQuery("  ", true), { wrapper });

    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("does not search when disabled", () => {
    renderHook(() => useStudentSearchQuery("ani", false), { wrapper });

    expect(mocks.get).not.toHaveBeenCalled();
  });
});
