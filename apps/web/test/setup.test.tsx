import { describe, expect, it } from "vitest";

describe("test setup", () => {
  // sonner (the toaster) captures the pointer when a toast is pressed, for
  // its swipe to dismiss; jsdom has no pointer capture, so the shared setup
  // stubs it for every test.
  it("gives elements a pointer capture sonner can call", () => {
    const toast = document.createElement("li");
    expect(() => {
      toast.setPointerCapture(1);
    }).not.toThrow();
  });
});
