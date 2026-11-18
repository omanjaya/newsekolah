import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SHELL_HEADER_HEIGHT_VAR, useShellHeaderHeight } from "./use-shell-header-height";

let resize: (() => void) | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

class FakeResizeObserver {
  constructor(callback: () => void) {
    resize = callback;
  }
  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
}

let stackHeight = 56;

function Shell() {
  const host = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  useShellHeaderHeight(stack, host);
  return (
    <div ref={host} data-testid="host">
      <div
        ref={(node) => {
          stack.current = node;
          if (node) {
            node.getBoundingClientRect = () => ({ height: stackHeight }) as DOMRect;
          }
        }}
      />
    </div>
  );
}

beforeEach(() => {
  stackHeight = 56;
  resize = undefined;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useShellHeaderHeight", () => {
  it("publishes the sticky stack's height and follows it as strips come and go", () => {
    const { getByTestId, unmount } = render(<Shell />);
    const host = getByTestId("host");
    expect(host.style.getPropertyValue(SHELL_HEADER_HEIGHT_VAR)).toBe("56px");
    expect(observe).toHaveBeenCalledTimes(1);

    // An offline strip appears under the header.
    stackHeight = 92.4;
    act(() => {
      resize?.();
    });
    expect(host.style.getPropertyValue(SHELL_HEADER_HEIGHT_VAR)).toBe("92px");

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
