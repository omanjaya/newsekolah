import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  data: undefined as { id: string; name: string; username: string }[] | undefined,
}));

vi.mock("../api", () => ({
  useStudentSearchQuery: (term: string, enabled: boolean) => {
    mocks.search(term, enabled);
    return { data: enabled ? mocks.data : undefined };
  },
}));

import { STUDENT_SEARCH_DEBOUNCE_MS, usePaletteStudentGroup } from "./use-palette-student-group";

function setup(enabled = true) {
  return renderHook(() =>
    usePaletteStudentGroup({ enabled, heading: "Siswa", icon: null, onSelect: vi.fn() }),
  );
}

const lastTerm = () => mocks.search.mock.calls.at(-1)?.[0] as string;

describe("usePaletteStudentGroup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.search.mockClear();
    mocks.data = [{ id: "s1", name: "Ani Lestari", username: "2301002" }];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends one term after a burst of keystrokes, only once typing pauses", () => {
    const { result } = setup();

    act(() => {
      result.current.onSearchChange("a");
      result.current.onSearchChange("an");
      vi.advanceTimersByTime(STUDENT_SEARCH_DEBOUNCE_MS - 1);
      result.current.onSearchChange("ani");
    });
    expect(lastTerm()).toBe("");

    act(() => {
      vi.advanceTimersByTime(STUDENT_SEARCH_DEBOUNCE_MS - 1);
    });
    expect(lastTerm()).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(lastTerm()).toBe("ani");
    const terms = new Set(mocks.search.mock.calls.map((call: unknown[]) => call[0]));
    expect(terms).toEqual(new Set(["", "ani"]));
  });

  it("builds the Siswa group from the hits", () => {
    const { result } = setup();

    expect(result.current.group?.heading).toBe("Siswa");
    expect(result.current.group?.items.map((item) => item.label)).toEqual([
      "Ani Lestari (2301002)",
    ]);
  });

  it("shows no group when there are no hits", () => {
    mocks.data = [];
    const { result } = setup();

    expect(result.current.group).toBeNull();
  });

  it("shows no group and disables the search for a reader who cannot open profiles", () => {
    const { result } = setup(false);

    expect(result.current.group).toBeNull();
    expect(mocks.search.mock.calls.every((call) => call[1] === false)).toBe(true);
  });

  it("clears the term on reset", () => {
    const { result } = setup();
    act(() => {
      result.current.onSearchChange("ani");
      vi.advanceTimersByTime(STUDENT_SEARCH_DEBOUNCE_MS);
    });
    expect(lastTerm()).toBe("ani");

    act(() => {
      result.current.reset();
    });
    expect(lastTerm()).toBe("");
  });
});
