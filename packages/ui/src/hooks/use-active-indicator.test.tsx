import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
