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
