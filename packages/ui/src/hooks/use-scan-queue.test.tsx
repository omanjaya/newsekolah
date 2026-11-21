import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useScanQueue } from "./use-scan-queue.js";

/** A processor whose calls stay pending until the test settles them, in order. */
function deferredProcessor() {
  const settle: (() => void)[] = [];
  const process = vi.fn(
    (_code: string) =>
      new Promise<void>((resolve) => {
        settle.push(resolve);
      }),
  );
  return {
    process,
    finishNext: async () => {
      await act(async () => {
        settle.shift()?.();
        await Promise.resolve();
      });
    },
  };
}

const identity = (code: string) => code;

describe("useScanQueue", () => {
  it("queues a different code read while one is in flight and runs it next", async () => {
    const { process, finishNext } = deferredProcessor();
    const { result } = renderHook(() => useScanQueue(process, identity));

    let accepted: boolean[] = [];
    act(() => {
      accepted = [result.current.enqueue("A"), result.current.enqueue("B")];
    });
    expect(accepted).toEqual([true, true]);
    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenLastCalledWith("A");
    expect(result.current.busy).toBe(true);

    await finishNext();
    await waitFor(() => {
      expect(process).toHaveBeenCalledTimes(2);
    });
    expect(process).toHaveBeenLastCalledWith("B");

    await finishNext();
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
  });

  it("drops a double read of the code in flight or last waiting", async () => {
    const { process, finishNext } = deferredProcessor();
    const { result } = renderHook(() => useScanQueue(process, identity));

    const accepted: boolean[] = [];
    // Every read lands in the same tick, before React re-renders.
    act(() => {
      accepted.push(result.current.enqueue("A"));
      accepted.push(result.current.enqueue("A"));
      accepted.push(result.current.enqueue("B"));
      accepted.push(result.current.enqueue("B"));
      accepted.push(result.current.enqueue("A"));
    });
    expect(accepted).toEqual([true, false, true, false, true]);

    await finishNext();
    await finishNext();
    await finishNext();
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    expect(process.mock.calls.map(([code]) => code)).toEqual(["A", "B", "A"]);
  });

  it("takes the same code again once its first read has finished", async () => {
    const process = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useScanQueue(process, identity));

    act(() => {
      result.current.enqueue("A");
    });
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    act(() => {
      result.current.enqueue("A");
    });
    await waitFor(() => {
      expect(process).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps going after a processor that throws", async () => {
    const process = vi.fn((code: string) =>
      code === "A" ? Promise.reject(new Error("boom")) : Promise.resolve(),
    );
    const { result } = renderHook(() => useScanQueue(process, identity));

    act(() => {
      result.current.enqueue("A");
      result.current.enqueue("B");
    });
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    expect(process.mock.calls.map(([code]) => code)).toEqual(["A", "B"]);
  });
});
