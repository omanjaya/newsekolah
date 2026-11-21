import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveIndicator } from "./use-active-indicator.js";

/** jsdom has no layout: each item reports a box from its data attributes. */
const geometry = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const key of geometry) {
    originals.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        return Number(this.dataset[key.toLowerCase()] ?? 0);
      },
    });
  }
});

afterAll(() => {
  for (const key of geometry) {
    const original = originals.get(key);
    if (original) Object.defineProperty(HTMLElement.prototype, key, original);
  }
});

function Strip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState("a");
  useActiveIndicator(containerRef, indicatorRef, '[aria-current="true"]');
  return (
    <div ref={containerRef} data-testid="strip">
      <span ref={indicatorRef} data-testid="indicator" />
      {[
        { id: "a", left: 4, width: 80 },
        { id: "b", left: 84, width: 120 },
      ].map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === active ? "true" : undefined}
          data-offsetleft={item.left}
          data-offsetwidth={item.width}
          data-offsetheight={32}
          data-offsettop={4}
          onClick={() => {
            setActive(item.id);
          }}
        >
          {item.id}
        </button>
      ))}
    </div>
  );
}

describe("useActiveIndicator", () => {
  it("places the indicator on the active item and marks the strip ready", () => {
    render(<Strip />);
    const indicator = screen.getByTestId("indicator");
    expect(indicator.style.getPropertyValue("--indicator-x")).toBe("4px");
    expect(indicator.style.getPropertyValue("--indicator-w")).toBe("80px");
    expect(indicator.style.getPropertyValue("--indicator-h")).toBe("32px");
    expect(indicator.style.getPropertyValue("--indicator-scale")).toBe("1");
    expect(screen.getByTestId("strip")).toHaveAttribute("data-indicator", "ready");
    expect(indicator).not.toHaveAttribute("data-instant");
  });

  it("moves to a newly active item and ends at its box with no leftover scale", async () => {
    render(<Strip />);
    await act(async () => {
      screen.getByRole("button", { name: "b" }).click();
      // The mutation observer reports on a microtask.
      await Promise.resolve();
    });
    const indicator = screen.getByTestId("indicator");
    expect(indicator.style.getPropertyValue("--indicator-x")).toBe("84px");
    expect(indicator.style.getPropertyValue("--indicator-w")).toBe("120px");
    expect(indicator.style.getPropertyValue("--indicator-scale")).toBe("1");
    expect(indicator).not.toHaveAttribute("data-instant");
  });
});

/** Records what is observed and reports a resize on demand. */
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  observed = new Set<Element>();
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.last = this;
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
  resize() {
    this.callback();
  }
}

/** Links nested in a list, like NavTabs: the strip's own children are not the items. */
function NestedStrip({ active }: { active: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useActiveIndicator(containerRef, indicatorRef, '[aria-current="page"]');
  return (
    <div ref={containerRef} data-testid="strip">
      <span ref={indicatorRef} data-testid="indicator" />
      <ul>
        {[
          { id: "a", left: 4, width: 80 },
          { id: "b", left: 84, width: 120 },
        ].map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={item.id === active ? "page" : undefined}
              data-offsetleft={item.left}
              data-offsetwidth={item.width}
              data-offsetheight={32}
              data-offsettop={4}
            >
              {item.id}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** NestedStrip inside a named track, the way NavTabs names an area's tabs. */
function NamedStrip({ label, active }: { label: string; active: string }) {
  return (
    <nav aria-label={label}>
      <NestedStrip active={active} />
    </nav>
  );
}

describe("useActiveIndicator across pages", () => {
  function indicatorXs(spy: { mock: { calls: unknown[][] } }): unknown[] {
    return spy.mock.calls.filter(([name]) => name === "--indicator-x").map(([, value]) => value);
  }

  it("slides from the tab the same strip showed on the page just left", () => {
    const left = render(<NamedStrip label="Perpustakaan" active="a" />);
    left.unmount();
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");
    try {
      render(<NamedStrip label="Perpustakaan" active="b" />);
      // From the old tab's box to the new one's, then no leftover scale.
      expect(indicatorXs(setProperty)).toEqual(["4px", "84px"]);
      const indicator = screen.getByTestId("indicator");
      expect(indicator.style.getPropertyValue("--indicator-scale")).toBe("1");
      expect(indicator).not.toHaveAttribute("data-instant");
      expect(screen.getByTestId("strip")).toHaveAttribute("data-indicator", "ready");
    } finally {
      setProperty.mockRestore();
    }
  });

  it("appears in place for another strip, or one with no name", () => {
    render(<NamedStrip label="Kesiswaan" active="a" />).unmount();
    render(<NestedStrip active="a" />).unmount();
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");
    try {
      const other = render(<NamedStrip label="Akademik" active="b" />);
      expect(indicatorXs(setProperty)).toEqual(["84px"]);
      other.unmount();
      setProperty.mockClear();
      render(<NestedStrip active="b" />);
      expect(indicatorXs(setProperty)).toEqual(["84px"]);
    } finally {
      setProperty.mockRestore();
    }
  });
});

describe("useActiveIndicator size tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeResizeObserver.last = null;
  });

  it("watches the active item itself, since the strip's box may not change with it", async () => {
    const { rerender } = render(<NestedStrip active="a" />);
    const observer = FakeResizeObserver.last;
    const first = screen.getByRole("link", { name: "a" });
    expect(observer?.observed.has(first)).toBe(true);
    expect(observer?.observed.has(screen.getByTestId("indicator"))).toBe(false);

    // A late font swap widens the label; only the item's own size changes.
    first.dataset.offsetwidth = "96";
    act(() => {
      observer?.resize();
    });
    const indicator = screen.getByTestId("indicator");
    expect(indicator.style.getPropertyValue("--indicator-w")).toBe("96px");

    // A newly active item is watched instead of the old one.
    await act(async () => {
      rerender(<NestedStrip active="b" />);
      await Promise.resolve();
    });
    const second = screen.getByRole("link", { name: "b" });
    expect(observer?.observed.has(second)).toBe(true);
    expect(observer?.observed.has(first)).toBe(false);
  });

  it("places the indicator again once web fonts have loaded", async () => {
    let fontsLoaded: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      fontsLoaded = resolve;
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
    try {
      render(<NestedStrip active="a" />);
      screen.getByRole("link", { name: "a" }).dataset.offsetwidth = "88";
      await act(async () => {
        fontsLoaded();
        await ready;
      });
      expect(screen.getByTestId("indicator").style.getPropertyValue("--indicator-w")).toBe("88px");
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });
});

/**
 * A strip that scrolls, with a layout jsdom does not have: the strip is
 * `data-clientwidth` wide with `data-scrollwidth` of content, and each item
 * sits at its `data-offsetleft` in that content, shifted by the scroll.
 */
describe("useActiveIndicator in a scrolled strip", () => {
  const scrolls = new WeakMap<HTMLElement, number>();

  beforeAll(() => {
    // Shadows jsdom's Element getters; removed again after the suite.
    Object.defineProperties(HTMLElement.prototype, {
      scrollWidth: {
        configurable: true,
        get(this: HTMLElement) {
          return Number(this.dataset.scrollwidth ?? 0);
        },
      },
      clientWidth: {
        configurable: true,
        get(this: HTMLElement) {
          return Number(this.dataset.clientwidth ?? 0);
        },
      },
      scrollLeft: {
        configurable: true,
        get(this: HTMLElement) {
          return scrolls.get(this) ?? 0;
        },
        set(this: HTMLElement, value: number) {
          const max = Math.max(0, this.scrollWidth - this.clientWidth);
          scrolls.set(this, Math.max(0, Math.min(value, max)));
        },
      },
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function (this: HTMLElement) {
        const root = this.closest<HTMLElement>("[data-scroll-root]");
        const left = root === this || !root ? 0 : this.offsetLeft - root.scrollLeft;
        const width = root === this ? this.clientWidth : this.offsetWidth;
        return {
          left,
          right: left + width,
          x: left,
          width,
          top: 0,
          y: 0,
          bottom: 40,
          height: 40,
          toJSON: () => ({}),
        };
      },
    });
  });

  afterAll(() => {
    for (const key of ["scrollWidth", "clientWidth", "scrollLeft", "getBoundingClientRect"]) {
      Reflect.deleteProperty(HTMLElement.prototype, key);
    }
  });

  /**
   * The inbox's kind filter on a 390px phone, "late" checked: before the
   * counts load the strip overflows by 1px; the counts then widen every
   * segment and push the checked one past the strip's edge.
   */
  function KindStrip({ counted, active = "late" }: { counted: boolean; active?: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLSpanElement>(null);
    useActiveIndicator(containerRef, indicatorRef, '[data-state="checked"]');
    const items = counted
      ? [
          { id: "all", left: 0, width: 140 },
          { id: "leave", left: 140, width: 150 },
          { id: "late", left: 290, width: 120 },
        ]
      : [
          { id: "all", left: 0, width: 120 },
          { id: "leave", left: 120, width: 120 },
          { id: "late", left: 240, width: 116 },
        ];
    return (
      <div
        ref={containerRef}
        role="radiogroup"
        aria-label="Filter"
        data-testid="strip"
        data-scroll-root=""
        data-clientwidth={358}
        data-scrollwidth={counted ? 437 : 359}
      >
        <span ref={indicatorRef} aria-hidden="true" data-testid="indicator" />
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === active}
            data-state={item.id === active ? "checked" : "unchecked"}
            data-offsetleft={item.left}
            data-offsetwidth={item.width}
            data-offsetheight={32}
          >
            {item.id}
            {counted && <span> 1</span>}
          </button>
        ))}
      </div>
    );
  }

  async function settle(run: () => void) {
    await act(async () => {
      run();
      // The mutation observer reports on a microtask.
      await Promise.resolve();
    });
  }

  it("shows the checked item again once counts arriving push it past the edge", async () => {
    const { rerender } = render(<KindStrip counted={false} />);
    const strip = screen.getByTestId("strip");
    // The strip overflows by 1px: the first reveal can only move it by 1.
    expect(strip.scrollLeft).toBe(1);
    await settle(() => {
      rerender(<KindStrip counted />);
    });
    // The checked item [290-410] now ends inside the 358px view.
    expect(strip.scrollLeft).toBe(79);
    expect(screen.getByTestId("indicator").style.getPropertyValue("--indicator-x")).toBe("290px");
  });

  it("leaves a strip the reader scrolled by hand where they put it", async () => {
    const { rerender } = render(<KindStrip counted={false} />);
    const strip = screen.getByTestId("strip");
    // A swipe back to the start.
    act(() => {
      strip.dispatchEvent(new Event("touchstart"));
      strip.scrollLeft = 0;
      strip.dispatchEvent(new Event("scroll"));
    });
    await settle(() => {
      rerender(<KindStrip counted />);
    });
    expect(strip.scrollLeft).toBe(0);

    // Choosing a segment shows it again, whatever the reader scrolled.
    await settle(() => {
      rerender(<KindStrip counted active="leave" />);
    });
    await settle(() => {
      rerender(<KindStrip counted active="late" />);
    });
    expect(strip.scrollLeft).toBe(79);
  });

  it("does not take the browser clamping the strip, with no gesture on it, for the reader's scroll", async () => {
    const { rerender } = render(<KindStrip counted={false} />);
    const strip = screen.getByTestId("strip");
    act(() => {
      strip.scrollLeft = 0;
      strip.dispatchEvent(new Event("scroll"));
    });
    await settle(() => {
      rerender(<KindStrip counted />);
    });
    expect(strip.scrollLeft).toBe(79);
  });
});
