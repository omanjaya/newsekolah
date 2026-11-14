import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no pointer capture. sonner (the toaster) captures the pointer
// on pointerdown for its swipe to dismiss, so any test that clicks a toast
// would otherwise throw. A test that needs its own stub still overrides it.
window.HTMLElement.prototype.setPointerCapture = vi.fn();
