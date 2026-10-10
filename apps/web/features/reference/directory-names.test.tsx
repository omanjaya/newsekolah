import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ GET: get }));

vi.mock("../../lib/api/client", () => ({ useApiClient: () => client }));

import { DIRECTORY_NAMES_CHUNK_SIZE, useDirectoryName, useDirectoryNames } from "./directory-names";

function person(id: string) {
  return { id, name: `Name ${id}`, username: id };
}

function requestedIds(call: unknown[]): string[] {
  return (call[1] as { params: { query: { ids: string[] } } }).params.query.ids;
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((_path: string, init: { params: { query: { ids: string[] } } }) =>
    Promise.resolve({
      data: init.params.query.ids.filter((id) => !id.startsWith("gone")).map(person),
    }),
  );
});

describe("useDirectoryNames", () => {
  it("fetches the distinct ids in one request and returns an id to person map", async () => {
    const { result } = renderHook(() => useDirectoryNames(["a", "b", "a", "", null, undefined]), {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(result.current.get("a")?.name).toBe("Name a");
    });
    expect(result.current.get("b")?.name).toBe("Name b");
    expect(get).toHaveBeenCalledTimes(1);
    expect(requestedIds(get.mock.calls[0] as unknown[]).sort()).toEqual(["a", "b"]);
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      querySerializer: { array: { explode: false } },
    });
  });

  it("splits more ids than one chunk into several requests", async () => {
    const ids = Array.from({ length: DIRECTORY_NAMES_CHUNK_SIZE * 2 + 5 }, (_, i) => `id-${i}`);
    const { result } = renderHook(() => useDirectoryNames(ids), { wrapper: wrapper() });

    await waitFor(() => {
      expect(result.current.size).toBe(ids.length);
    });
    expect(get).toHaveBeenCalledTimes(3);
    for (const call of get.mock.calls) {
      expect(requestedIds(call).length).toBeLessThanOrEqual(DIRECTORY_NAMES_CHUNK_SIZE);
    }
  });

  it("batches ids asked by different components into one request", async () => {
    const w = wrapper();
    const first = renderHook(() => useDirectoryNames(["a"]), { wrapper: w });
    const second = renderHook(() => useDirectoryNames(["b"]), { wrapper: w });

    await waitFor(() => {
      expect(first.result.current.has("a")).toBe(true);
      expect(second.result.current.has("b")).toBe(true);
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reuses cached people and only asks for the new ones", async () => {
    const w = wrapper();
    const first = renderHook(() => useDirectoryNames(["a", "b"]), { wrapper: w });
    await waitFor(() => {
      expect(first.result.current.size).toBe(2);
    });
    expect(get).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useDirectoryNames(["b", "c"]), { wrapper: w });
    await waitFor(() => {
      expect(second.result.current.has("c")).toBe(true);
    });
    expect(second.result.current.get("b")?.name).toBe("Name b");
    expect(get).toHaveBeenCalledTimes(2);
    expect(requestedIds(get.mock.calls[1] as unknown[])).toEqual(["c"]);
  });

  it("leaves a missing person out and does not ask for them again", async () => {
    const w = wrapper();
    const first = renderHook(() => useDirectoryNames(["a", "gone-1"]), { wrapper: w });
    await waitFor(() => {
      expect(first.result.current.has("a")).toBe(true);
    });
    expect(first.result.current.has("gone-1")).toBe(false);

    renderHook(() => useDirectoryNames(["gone-1"]), { wrapper: w });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("makes no request when disabled or when there are no ids", async () => {
    renderHook(() => useDirectoryNames(["a"], false), { wrapper: wrapper() });
    renderHook(() => useDirectoryNames([]), { wrapper: wrapper() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useDirectoryName", () => {
  it("resolves a single person and is undefined for an empty id", async () => {
    const { result } = renderHook(() => useDirectoryName("a"), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current?.name).toBe("Name a");
    });

    const none = renderHook(() => useDirectoryName(""), { wrapper: wrapper() });
    expect(none.result.current).toBeUndefined();
  });
});
