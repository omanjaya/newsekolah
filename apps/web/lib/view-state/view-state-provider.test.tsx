import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
}));

import { ViewStateProvider, ViewStateStore, useRememberedViewState } from "./view-state-provider";

function Wrapper({ children }: { children: ReactNode }) {
  return <ViewStateProvider>{children}</ViewStateProvider>;
}

function IdentityWrapper({ children, identity }: { children: ReactNode; identity: string }) {
  return <ViewStateProvider key={identity}>{children}</ViewStateProvider>;
}

function SearchProbe() {
  const [search, setSearch] = useRememberedViewState("search", "");
  return (
    <button
      onClick={() => {
        setSearch("biology");
      }}
    >
      {search}
    </button>
  );
}

describe("ViewStateStore", () => {
  it("keeps route state isolated by account context", () => {
    const firstAccount = new ViewStateStore();
    const secondAccount = new ViewStateStore();
    firstAccount.write("/library:search", "biology");

    expect(firstAccount.read("/library:search", "")).toBe("biology");
    expect(secondAccount.read("/library:search", "")).toBe("");
  });

  it("evicts least recently used route keys after one hundred entries", () => {
    const store = new ViewStateStore();
    for (let index = 0; index < 101; index += 1)
      store.write(`/route-${index}:search`, String(index));

    expect(store.size).toBe(100);
    expect(store.read("/route-0:search", "missing")).toBe("missing");
    expect(store.read("/route-100:search", "missing")).toBe("100");
  });
});

describe("useRememberedViewState", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/first");
  });

  it("restores a route's filter when returning to it", () => {
    const { result, rerender } = renderHook(() => useRememberedViewState("search", ""), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current[1]("biology");
    });
    window.history.replaceState(null, "", "/second");
    rerender();
    expect(result.current[0]).toBe("");

    act(() => {
      result.current[1]("chemistry");
    });
    window.history.replaceState(null, "", "/first");
    rerender();

    expect(result.current[0]).toBe("biology");
  });

  it("clears state when the identity-scoped provider remounts", () => {
    const { rerender } = render(
      <IdentityWrapper identity="first-account">
        <SearchProbe />
      </IdentityWrapper>,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("biology");

    rerender(
      <IdentityWrapper identity="second-account">
        <SearchProbe />
      </IdentityWrapper>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("");
  });

  it("keeps an object fallback stable across rerenders", () => {
    const { result, rerender } = renderHook(
      () => useRememberedViewState("filters", { status: "active" }),
      { wrapper: Wrapper },
    );
    const initial = result.current[0];

    rerender();

    expect(result.current[0]).toBe(initial);
  });

  it("composes functional updates issued in the same turn", () => {
    const { result } = renderHook(() => useRememberedViewState("page", 0), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current[1]((value) => value + 1);
      result.current[1]((value) => value + 1);
    });

    expect(result.current[0]).toBe(2);
  });
});
