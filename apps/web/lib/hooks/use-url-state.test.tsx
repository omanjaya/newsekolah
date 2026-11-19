import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The router's view of the query. `null` follows the browser address, as
// Next does once a history write has landed; a string stands for the
// query of a client navigation the browser has not committed yet.
const router = vi.hoisted(() => ({ search: null as string | null }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(router.search ?? window.location.search),
}));

import { useUrlState } from "./use-url-state";

const tabs = ["students", "teachers"] as const;

describe("useUrlState", () => {
  beforeEach(() => {
    router.search = null;
    window.history.replaceState(null, "", "/school/classes?view=compact#roster");
  });

  it("preserves unrelated parameters and the hash when writing a value", () => {
    const { result } = renderHook(() => useUrlState("tab", tabs, "students"));

    act(() => {
      result.current[1]("teachers");
    });

    expect(window.location.href).toContain("view=compact");
    expect(window.location.href).toContain("tab=teachers");
    expect(window.location.hash).toBe("#roster");
    expect(result.current[0]).toBe("teachers");
  });

  it("hands the history API a string URL, which a Worker can clone", () => {
    // With Serwist's cacheOnNavigation on (it is off now, next.config.ts)
    // pushState/replaceState are wrapped and the URL argument is posted to
    // a Worker; a URL object there throws DataCloneError on every write.
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useUrlState("tab", tabs, "students"));

    act(() => {
      result.current[1]("teachers");
    });
    act(() => {
      result.current[2]("students");
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(typeof push.mock.calls[0]?.[2]).toBe("string");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(typeof replace.mock.calls[0]?.[2]).toBe("string");
    expect(window.location.search).toBe("?view=compact&tab=students");
    push.mockRestore();
    replace.mockRestore();
  });

  it("reads the router's query during a client navigation, not the old address", () => {
    // A tab Link or a redirect renders the new page before the browser
    // address changes; reading window.location there showed the default.
    window.history.replaceState(null, "", "/library/master-data");
    router.search = "?tab=teachers";

    const { result } = renderHook(() => useUrlState("tab", tabs, "students"));

    expect(result.current[0]).toBe("teachers");
  });

  it("uses the default for unknown values and follows the router's query", () => {
    router.search = "?tab=unknown";
    const { result, rerender } = renderHook(() => useUrlState("tab", tabs, "students"));
    expect(result.current[0]).toBe("students");

    // Back and forward reach the hook through the router, which hands it
    // the restored query.
    router.search = "?tab=teachers";
    rerender();
    expect(result.current[0]).toBe("teachers");
  });

  it("drops an emptied key whose default is empty instead of writing `key=`", () => {
    window.history.replaceState(null, "", "/settings/audit-logs?from=2026-11-10&to=2026-11-12");
    const anyDate = (value: string) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);
    const { result } = renderHook(() => useUrlState("to", anyDate, ""));

    act(() => {
      result.current[1]("");
    });

    expect(window.location.search).toBe("?from=2026-11-10");
    expect(result.current[0]).toBe("");
  });
});
