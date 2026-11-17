import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { OPAC_LAST_SEARCH_KEY, useOpacSearchParams } from "./use-opac-search-params";

describe("useOpacSearchParams", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/opac?q=laut");
    window.sessionStorage.clear();
  });

  it("replaces the address with the search, dropping empty parameters", () => {
    const { result } = renderHook(() => useOpacSearchParams());
    expect(result.current[0]).toEqual({ q: "laut", klasifikasi: "" });

    act(() => {
      result.current[1]({ q: "", klasifikasi: "500" });
    });

    expect(result.current[0]).toEqual({ q: "", klasifikasi: "500" });
    expect(window.location.search).toBe("?klasifikasi=500");
    expect(window.sessionStorage.getItem(OPAC_LAST_SEARCH_KEY)).toBe("?klasifikasi=500");
  });

  it("hands the history API a string URL, which a Worker can clone", () => {
    // The service worker's navigation cache wraps replaceState and posts
    // the URL argument to a Worker; a URL object there throws DataCloneError.
    const replace = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useOpacSearchParams());

    act(() => {
      result.current[1]({ q: "hutan" });
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(typeof replace.mock.calls[0]?.[2]).toBe("string");
    replace.mockRestore();
  });
});
