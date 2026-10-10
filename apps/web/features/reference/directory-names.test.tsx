import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ GET: get }));

vi.mock("../../lib/api/client", () => ({ useApiClient: () => client }));

import {
  DIRECTORY_NAMES_CHUNK_SIZE,
  useDirectoryName,
  useDirectoryNames,
  useDirectorySearch,
  useResolveDirectoryNames,
} from "./directory-names";

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

describe("useDirectorySearch", () => {
  it("searches one kind on the server and primes the name cache with every hit", async () => {
    get.mockReset();
    get.mockResolvedValue({ data: [person("a"), person("b")] });
    const w = wrapper();
    const search = renderHook(
      () => useDirectorySearch({ profileKind: "student", query: "na", limit: 30 }),
      { wrapper: w },
    );
    await waitFor(() => {
      expect(search.result.current.data).toHaveLength(2);
    });
    expect(get).toHaveBeenCalledWith("/v1/directory/users", {
      params: { query: { profile_kind: "student", q: "na", limit: 30 } },
    });

    // Both hits are now known by id, so showing them by name costs no request.
    const names = renderHook(() => useDirectoryNames(["a", "b"]), { wrapper: w });
    await waitFor(() => {
      expect(names.result.current.size).toBe(2);
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("merges several kinds into one name-ordered list", async () => {
    get.mockReset();
    get.mockImplementation(
      (_path: string, init: { params: { query: { profile_kind?: string } } }) =>
        Promise.resolve({
          data:
            init.params.query.profile_kind === "teacher"
              ? [{ id: "t", name: "Zed", username: "t" }]
              : [{ id: "s", name: "Ann", username: "s" }],
        }),
    );
    const { result } = renderHook(
      () => useDirectorySearch({ profileKind: ["teacher", "staff"], query: "" }),
      { wrapper: wrapper() },
    );
    await waitFor(() => {
      expect(result.current.data).toHaveLength(2);
    });
    expect(result.current.data?.map((user) => user.name)).toEqual(["Ann", "Zed"]);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("useResolveDirectoryNames", () => {
  it("fetches people on demand through the same batch and cache", async () => {
    get.mockReset();
    get.mockImplementation((_path: string, init: { params: { query: { ids: string[] } } }) =>
      Promise.resolve({ data: init.params.query.ids.map(person) }),
    );
    const { result } = renderHook(() => useResolveDirectoryNames(), { wrapper: wrapper() });

    const first = await result.current(["a", "b", null]);
    expect([...first.keys()].sort()).toEqual(["a", "b"]);
    await result.current(["a"]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
