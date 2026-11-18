import { act, render } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent, ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  confirmUnsavedChangesBeforeNavigation,
  useUnsavedChangesPrompt,
  useUnsavedChangesProtection,
  type UnsavedChangesPrompt,
} from "./use-unsaved-changes-protection";

type TestNavigation = EventTarget & { traverseTo?: (key: string) => unknown };

function Host({ askToLeave }: { askToLeave: UnsavedChangesPrompt }): null {
  useUnsavedChangesPrompt(askToLeave);
  return null;
}

/**
 * An editor with unsaved changes and a link out. The link records whether
 * each click reached it already cancelled, then cancels it the way
 * next/link does before routing on the client.
 */
function Guard({
  dirty = true,
  onLinkClick = () => undefined,
}: {
  dirty?: boolean;
  onLinkClick?: (alreadyPrevented: boolean) => void;
}): ReactElement {
  useUnsavedChangesProtection(dirty, "Discard edits?");
  return (
    <a
      href="/next"
      onClick={(event: ReactMouseEvent) => {
        onLinkClick(event.defaultPrevented);
        event.preventDefault();
      }}
    >
      Next
    </a>
  );
}

function setNavigation(navigation: TestNavigation | undefined) {
  (window as Window & { navigation?: TestNavigation }).navigation = navigation;
}

function traversal(key: string, cancelable = true) {
  return Object.assign(new Event("navigate", { cancelable }), {
    navigationType: "traverse" as const,
    destination: { key },
  });
}

/** Lets the answer reach the held navigation. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function clickLink(link: HTMLElement) {
  act(() => {
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

describe("useUnsavedChangesProtection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setNavigation(undefined);
  });

  it("holds an in-app link until the person chooses to leave, then replays that click", async () => {
    const askToLeave = vi.fn(() => Promise.resolve(true));
    const onLinkClick = vi.fn();
    const { getByRole } = render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard onLinkClick={onLinkClick} />
      </>,
    );

    clickLink(getByRole("link"));
    await settle();

    expect(askToLeave).toHaveBeenCalledTimes(1);
    expect(askToLeave).toHaveBeenCalledWith("Discard edits?");
    expect(onLinkClick.mock.calls).toEqual([[true], [false]]);
  });

  it("stays on the page when the person keeps their changes", async () => {
    const askToLeave = vi.fn(() => Promise.resolve(false));
    const onLinkClick = vi.fn();
    const { getByRole } = render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard onLinkClick={onLinkClick} />
      </>,
    );

    clickLink(getByRole("link"));
    await settle();

    expect(onLinkClick.mock.calls).toEqual([[true]]);
  });

  it("asks once while a question is open", () => {
    const askToLeave = vi.fn(() => new Promise<boolean>(() => undefined));
    const onLinkClick = vi.fn();
    const { getByRole } = render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard onLinkClick={onLinkClick} />
      </>,
    );

    clickLink(getByRole("link"));
    clickLink(getByRole("link"));

    expect(onLinkClick.mock.calls).toEqual([[true], [true]]);
    expect(askToLeave).toHaveBeenCalledTimes(1);
  });

  it("lets links through when nothing is dirty", () => {
    const askToLeave = vi.fn(() => Promise.resolve(false));
    const onLinkClick = vi.fn();
    const { getByRole } = render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard dirty={false} onLinkClick={onLinkClick} />
      </>,
    );

    clickLink(getByRole("link"));

    expect(onLinkClick.mock.calls).toEqual([[false]]);
    expect(askToLeave).not.toHaveBeenCalled();
  });

  it("asks before an explicit navigation and passes on the answer", async () => {
    const askToLeave = vi.fn(() => Promise.resolve(true));
    render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard />
      </>,
    );

    await expect(confirmUnsavedChangesBeforeNavigation()).resolves.toBe(true);
    expect(askToLeave).toHaveBeenCalledTimes(1);

    askToLeave.mockResolvedValueOnce(false);
    await expect(confirmUnsavedChangesBeforeNavigation()).resolves.toBe(false);
  });

  it("allows an explicit navigation without asking when nothing is dirty", async () => {
    const askToLeave = vi.fn(() => Promise.resolve(false));
    render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard dirty={false} />
      </>,
    );

    await expect(confirmUnsavedChangesBeforeNavigation()).resolves.toBe(true);
    expect(askToLeave).not.toHaveBeenCalled();
  });

  it("only intercepts cancellable browser traversals", () => {
    const askToLeave = vi.fn(() => new Promise<boolean>(() => undefined));
    const navigation: TestNavigation = new EventTarget();
    setNavigation(navigation);
    render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard />
      </>,
    );
    const pushed = Object.assign(new Event("navigate", { cancelable: true }), {
      navigationType: "push" as const,
    });
    const nonCancelable = traversal("entry-1", false);
    const cancellable = traversal("entry-1");

    act(() => {
      navigation.dispatchEvent(pushed);
      navigation.dispatchEvent(nonCancelable);
      navigation.dispatchEvent(cancellable);
    });

    expect(pushed.defaultPrevented).toBe(false);
    expect(nonCancelable.defaultPrevented).toBe(false);
    expect(cancellable.defaultPrevented).toBe(true);
    expect(askToLeave).toHaveBeenCalledTimes(1);
  });

  it("goes back to the same history entry once the person chooses to leave", async () => {
    const askToLeave = vi.fn(() => Promise.resolve(true));
    const navigation: TestNavigation = new EventTarget();
    const traverseTo = vi.fn((key: string) => {
      navigation.dispatchEvent(replayed);
      return { committed: Promise.resolve(key), finished: Promise.resolve(key) };
    });
    navigation.traverseTo = traverseTo;
    setNavigation(navigation);
    const replayed = traversal("entry-1");
    render(
      <>
        <Host askToLeave={askToLeave} />
        <Guard />
      </>,
    );

    const back = traversal("entry-1");
    act(() => {
      navigation.dispatchEvent(back);
    });
    await settle();

    expect(back.defaultPrevented).toBe(true);
    expect(traverseTo).toHaveBeenCalledWith("entry-1");
    expect(replayed.defaultPrevented).toBe(false);
    expect(askToLeave).toHaveBeenCalledTimes(1);
  });

  it("does not hold navigation when no dialog is mounted to ask with", async () => {
    const onLinkClick = vi.fn();
    const { getByRole } = render(<Guard onLinkClick={onLinkClick} />);

    clickLink(getByRole("link"));

    expect(onLinkClick.mock.calls).toEqual([[false]]);
    await expect(confirmUnsavedChangesBeforeNavigation()).resolves.toBe(true);
  });
});
