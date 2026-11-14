import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScrollEdges } from "./use-scroll-edges.js";

function Strip({ markParent = false }: { markParent?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref, { axis: "x", markParent });
  return (
    <div data-testid="parent">
      <div ref={ref} data-testid="strip">
        <span>Isi</span>
      </div>
    </div>
  );
}

/** jsdom has no layout: give the strip a 100px window onto 300px of content. */
function size(element: HTMLElement, scrollLeft: number) {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(element, "scrollWidth", { configurable: true, value: 300 });
  element.scrollLeft = scrollLeft;
}

describe("useScrollEdges", () => {
  it("marks the edges that have content past them, and follows scrolling", () => {
    const { rerender } = render(<Strip />);
    const strip = screen.getByTestId("strip");
    size(strip, 0);
    fireEvent.scroll(strip);
    expect(strip).not.toHaveAttribute("data-overflow-start");
    expect(strip).toHaveAttribute("data-overflow-end");

    strip.scrollLeft = 100;
    fireEvent.scroll(strip);
    expect(strip).toHaveAttribute("data-overflow-start");
    expect(strip).toHaveAttribute("data-overflow-end");

    strip.scrollLeft = 200;
    fireEvent.scroll(strip);
    expect(strip).toHaveAttribute("data-overflow-start");
    expect(strip).not.toHaveAttribute("data-overflow-end");
    rerender(<Strip />);
  });

  it("can mark the parent instead, for a dialog's header and footer", () => {
    render(<Strip markParent />);
    const strip = screen.getByTestId("strip");
    size(strip, 50);
    fireEvent.scroll(strip);
    expect(screen.getByTestId("parent")).toHaveAttribute("data-overflow-start");
    expect(strip).not.toHaveAttribute("data-overflow-start");
  });

  it("clears its marks on unmount", () => {
    const { unmount } = render(<Strip />);
    const strip = screen.getByTestId("strip");
    size(strip, 50);
    fireEvent.scroll(strip);
    unmount();
    expect(strip).not.toHaveAttribute("data-overflow-start");
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

/** A dialog body whose form replaces its skeleton once data arrives. */
function Body({ loaded }: { loaded: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref, { axis: "y" });
  return (
    <div ref={ref} data-testid="body">
      {loaded ? <form data-testid="form" /> : <div data-testid="skeleton" />}
    </div>
  );
}

describe("useScrollEdges size tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeResizeObserver.last = null;
  });

  it("keeps watching content that mounts later, so its growth still moves the divider", async () => {
    const { rerender } = render(<Body loaded={false} />);
    const body = screen.getByTestId("body");
    const observer = FakeResizeObserver.last;
    expect(observer?.observed.has(screen.getByTestId("skeleton"))).toBe(true);

    await act(async () => {
      rerender(<Body loaded />);
      // The mutation observer reports on a microtask.
      await Promise.resolve();
    });
    const form = screen.getByTestId("form");
    expect(observer?.observed.has(form)).toBe(true);
    expect(observer?.observed.size).toBe(2);
    expect(body).not.toHaveAttribute("data-overflow-end");

    // A section inside the form opens: only the form's own size changes.
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 640 });
    act(() => {
      observer?.resize();
    });
    expect(body).toHaveAttribute("data-overflow-end");
  });
});
