import { act, render, screen } from "@testing-library/react";
import { useRef, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStuckToBottom } from "./use-stuck-to-bottom";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

const observers: { callback: Callback; options?: IntersectionObserverInit }[] = [];

class FakeObserver {
  constructor(callback: Callback, options?: IntersectionObserverInit) {
    observers.push({ callback, options });
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

function Dock({ enabled = true }: { enabled?: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useStuckToBottom(ref, enabled);
  return (
    <div ref={ref} style={{ position: "sticky", bottom: "64px" }} data-testid="dock">
      {stuck ? "stuck" : "resting"}
    </div>
  );
}

/** The root is a 800px screen cut short by the 64px inset and 1px. */
function report(ratio: number, top: number, bottom: number) {
  act(() => {
    observers.at(-1)?.callback([
      {
        intersectionRatio: ratio,
        boundingClientRect: { top, bottom } as DOMRectReadOnly,
        rootBounds: { top: 0, bottom: 735 } as DOMRectReadOnly,
      },
    ]);
  });
}

describe("useStuckToBottom", () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("watches a root cut short by the element's own inset", () => {
    render(<Dock />);
    expect(observers.at(-1)?.options?.rootMargin).toBe("0px 0px -65px 0px");
  });

  it("is stuck while the element reaches past the inset line, resting once it shows whole", () => {
    render(<Dock />);
    report(0.98, 680, 736);
    expect(screen.getByTestId("dock")).toHaveTextContent("stuck");
    report(1, 500, 556);
    expect(screen.getByTestId("dock")).toHaveTextContent("resting");
  });

  it("is not stuck while the element leaves at the top of the screen", () => {
    render(<Dock />);
    report(0.4, -30, 26);
    expect(screen.getByTestId("dock")).toHaveTextContent("resting");
  });

  it("does not watch while disabled", () => {
    render(<Dock enabled={false} />);
    expect(observers).toHaveLength(0);
    expect(screen.getByTestId("dock")).toHaveTextContent("resting");
  });
});
