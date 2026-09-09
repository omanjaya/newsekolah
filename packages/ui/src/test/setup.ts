import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import * as matchers from "vitest-axe/matchers";

expect.extend(matchers);

// Vitest has no built-in per-test DOM teardown; without this, renders from
// one `it()` (and its Radix portals) leak into the next in the same file.
afterEach(() => {
  cleanup();
});

// jsdom declares these on the prototype but does not implement them; several
// Radix primitives (Select, Dialog positioning) call them unconditionally.
// Always overriding (rather than checking first) keeps this file simple and
// is safe: it only runs in the test environment.
window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};
