import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { gradingKeys, useSaveComponentScoresMutation, type Gradebook } from "./api";

const put = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ PUT: put }) }));
vi.mock("./realtime", () => ({ useMyGradesLive: () => undefined }));

function sheet(termId: string, score: number | undefined): Gradebook {
  return {
    class_id: "class-1",
    subject_id: "subject-1",
    term_id: termId,
    components: [],
    students: [
      {
        student_user_id: "s1",
        name: "Siswa Dua Contoh",
        scores: score === undefined ? {} : { c1: score },
      },
    ],
  } as unknown as Gradebook;
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const { result } = renderHook(() => useSaveComponentScoresMutation(), { wrapper: Wrapper });
  return { queryClient, result };
}

beforeEach(() => {
  put.mockReset();
});

describe("useSaveComponentScoresMutation", () => {
  it("updates the default 'active term' sheet, cached without a term in its key", async () => {
    const { queryClient, result } = setup();
    // The page opened on "Semester aktif" asks without a term, so its key
    // ends in "" while the save response names the concrete term.
    const activeKey = gradingKeys.gradebook("class-1", "subject-1");
    queryClient.setQueryData(activeKey, sheet("term-1", undefined));
    put.mockResolvedValue(sheet("term-1", 65));

    await act(async () => {
      await result.current.mutateAsync({
        componentId: "c1",
        entries: [{ student_user_id: "s1", score: 65 }],
      });
    });

    expect(queryClient.getQueryData<Gradebook>(activeKey)?.students[0]?.scores).toEqual({
      c1: 65,
    });
    expect(
      queryClient.getQueryData<Gradebook>(gradingKeys.gradebook("class-1", "subject-1", "term-1"))
        ?.students[0]?.scores,
    ).toEqual({ c1: 65 });
  });

  it("never overwrites another term's sheet of the same class and subject", async () => {
    const { queryClient, result } = setup();
    const otherTermKey = gradingKeys.gradebook("class-1", "subject-1", "term-2");
    queryClient.setQueryData(otherTermKey, sheet("term-2", 90));
    put.mockResolvedValue(sheet("term-1", 65));

    await act(async () => {
      await result.current.mutateAsync({
        componentId: "c1",
        entries: [{ student_user_id: "s1", score: 65 }],
      });
    });

    expect(queryClient.getQueryData<Gradebook>(otherTermKey)?.students[0]?.scores).toEqual({
      c1: 90,
    });
  });

  it("sends a cleared cell as a null score", async () => {
    const { result } = setup();
    put.mockResolvedValue(sheet("term-1", undefined));

    await act(async () => {
      await result.current.mutateAsync({
        componentId: "c1",
        entries: [{ student_user_id: "s1", score: null }],
      });
    });

    expect(put).toHaveBeenCalledWith("/v1/grading/components/{componentId}/scores", {
      params: { path: { componentId: "c1" } },
      body: { entries: [{ student_user_id: "s1", score: null }] },
    });
  });
});
