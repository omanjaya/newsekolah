import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";

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
