import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useContainerMinWidth } from "./use-container-min-width.js";

function Box() {
  const [ref, wide] = useContainerMinWidth(720);
  return (
    <div ref={ref} data-testid="box">
      {wide ? "wide" : "narrow"}
    </div>
  );
}

let width = 0;
let notify: (() => void) | null = null;

beforeEach(() => {
  width = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width }) as DOMRect,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe() {
        // The test calls notify() itself after changing the width.
      }
      disconnect() {
        notify = null;
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  notify = null;
});

describe("useContainerMinWidth", () => {
  it("reads the element's own width on mount", () => {
    width = 800;
    render(<Box />);
    expect(screen.getByTestId("box")).toHaveTextContent("wide");
  });

  it("is false when the element is narrower, however wide the viewport", () => {
    width = 510;
    render(<Box />);
    expect(screen.getByTestId("box")).toHaveTextContent("narrow");
  });

  it("follows the element as it resizes", () => {
    width = 510;
    render(<Box />);
    width = 760;
    act(() => {
      notify?.();
    });
    expect(screen.getByTestId("box")).toHaveTextContent("wide");
    width = 700;
    act(() => {
      notify?.();
    });
    expect(screen.getByTestId("box")).toHaveTextContent("narrow");
  });
});
