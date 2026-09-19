import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  confirmUnsavedChangesBeforeNavigation,
  useUnsavedChangesProtection,
} from "./use-unsaved-changes-protection";

function Guard(): ReactElement {
  useUnsavedChangesProtection(true, "Discard edits?");
  return <a href="/next">Next</a>;
}

describe("useUnsavedChangesProtection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { navigation?: EventTarget }).navigation;
  });

  it("cancels an in-app link once without a second Navigation API prompt", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const navigation = new EventTarget();
    (window as Window & { navigation?: EventTarget }).navigation = navigation;
    const { getByRole } = render(<Guard />);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });

    act(() => {
      getByRole("link").dispatchEvent(click);
    });

    expect(click.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("allows an accepted explicit navigation with one confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Guard />);

    expect(confirmUnsavedChangesBeforeNavigation()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("only intercepts cancellable browser traversals", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const navigation = new EventTarget();
    (window as Window & { navigation?: EventTarget }).navigation = navigation;
    render(<Guard />);
    const pushed = Object.assign(new Event("navigate", { cancelable: true }), {
      navigationType: "push" as const,
    });
    const traversal = Object.assign(new Event("navigate", { cancelable: true }), {
      navigationType: "traverse" as const,
    });
    const nonCancelableTraversal = Object.assign(new Event("navigate"), {
      navigationType: "traverse" as const,
    });

    act(() => {
      navigation.dispatchEvent(pushed);
      navigation.dispatchEvent(nonCancelableTraversal);
      navigation.dispatchEvent(traversal);
    });

    expect(pushed.defaultPrevented).toBe(false);
    expect(nonCancelableTraversal.defaultPrevented).toBe(false);
    expect(traversal.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
