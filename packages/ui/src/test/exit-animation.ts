import { act } from "@testing-library/react";
import { vi } from "vitest";

/** The keyframes name a closing layer reports here. */
const EXIT_ANIMATION = "exit";

/**
 * jsdom applies no stylesheet and runs no animation, so Radix Presence,
 * which keeps a closing layer mounted while `getComputedStyle(node)`
 * reports an exit animation, would unmount every layer at once. This
 * reports an animation on any element whose `data-state` is `closed`,
 * read live as Presence expects, so a test can see which layers wait for
 * their exit (only those Presence can see: an element it never got a ref
 * to still goes at once) and end it with `endExitAnimation`. Returns the
 * restore function.
 */
export function playExitAnimations(): () => void {
  const real = globalThis.getComputedStyle.bind(globalThis);
  const spy = vi
    .spyOn(globalThis, "getComputedStyle")
    .mockImplementation((element: Element, pseudo?: string | null) => {
      const styles = real(element, pseudo);
      return new Proxy(styles, {
        get(target, property) {
          if (property === "animationName") {
            return element.getAttribute("data-state") === "closed" ? EXIT_ANIMATION : "none";
          }
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === "function" ? (value as () => unknown).bind(target) : value;
        },
      });
    });
  // Presence matches the ending animation's name through CSS.escape, which jsdom lacks.
  const stubbedCss = !("CSS" in globalThis);
  if (stubbedCss) vi.stubGlobal("CSS", { escape: (value: string) => value });
  return () => {
    spy.mockRestore();
    if (stubbedCss) vi.unstubAllGlobals();
  };
}

/** Ends the exit animation `element` is playing, as the browser would. */
export function endExitAnimation(element: Element | null): void {
  if (!element) throw new Error("No element to end the exit animation of");
  // jsdom has no AnimationEvent, so the name is set on a plain event.
  const event = new Event("animationend", { bubbles: true });
  Object.defineProperty(event, "animationName", { value: EXIT_ANIMATION });
  act(() => {
    element.dispatchEvent(event);
  });
}
