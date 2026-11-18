"use client";

import { useEffect } from "react";

/**
 * Asks the person whether to leave and drop their unsaved changes; resolves
 * true to leave. The shell's UnsavedChangesDialog provides it.
 */
export type UnsavedChangesPrompt = (message: string) => Promise<boolean>;

interface Guard {
  readonly message: string;
}

/** Editors holding changes only in memory right now, in the order they became dirty. */
const activeGuards = new Set<Guard>();
let prompt: UnsavedChangesPrompt | null = null;
/** The question open right now: further navigations wait for its answer, not a second dialog. */
let openQuestion: object | null = null;

function latestMessage(): string | undefined {
  let message: string | undefined;
  for (const guard of activeGuards) message = guard.message;
  return message;
}

/**
 * The person's answer for the newest dirty editor, or null when nothing has
 * to be asked (no dirty editor, or no dialog mounted to ask with) and false
 * while another question is still open.
 */
function ask(): Promise<boolean> | null {
  const message = latestMessage();
  if (message === undefined || !prompt) return null;
  if (openQuestion) return Promise.resolve(false);
  const question = {};
  openQuestion = question;
  return prompt(message).finally(() => {
    if (openQuestion === question) openQuestion = null;
  });
}

/**
 * Lets navigation initiated by a button or the command palette ask active
 * editors first. Resolves true when nothing is dirty or the person chose to
 * leave.
 */
export function confirmUnsavedChangesBeforeNavigation(): Promise<boolean> {
  return ask() ?? Promise.resolve(true);
}

/**
 * Stops ordinary in-app link navigation, back and forward, and browser
 * reloads while an editor has changes that are only held in memory. It
 * deliberately does not create a local draft: attendance rosters and scores
 * should not be copied to storage.
 */
export function useUnsavedChangesProtection(isDirty: boolean, message: string): void {
  useEffect(() => {
    if (!isDirty) return;
    const guard: Guard = { message };
    activeGuards.add(guard);

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      activeGuards.delete(guard);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isDirty, message]);
}

interface NavigationTraversal {
  committed: Promise<unknown>;
  finished: Promise<unknown>;
}

type NavigationApi = EventTarget & { traverseTo?: (key: string) => NavigationTraversal };

type NavigateEventFields = Event & {
  navigationType?: "push" | "reload" | "replace" | "traverse";
  destination?: { key?: string };
};

function ignoreRejection(): undefined {
  return undefined;
}

/**
 * Mounted once by the shell. Holds every intercepted navigation, asks with
 * `askToLeave`, and replays the navigation when the person chooses to leave:
 * the same link is clicked again (so next/link still navigates on the
 * client) or the same history entry is traversed to.
 */
export function useUnsavedChangesPrompt(askToLeave: UnsavedChangesPrompt): void {
  useEffect(() => {
    prompt = askToLeave;
    /** Set while a confirmed navigation replays, so the guard lets it through. */
    let replayingClick = false;
    let replayingTraversalKey: string | undefined;

    function intercept(event: Event, replay: () => void) {
      const answer = ask();
      if (!answer) return;
      event.preventDefault();
      void answer.then((leave) => {
        if (leave) replay();
      });
    }

    const navigationApi = (window as Window & { navigation?: NavigationApi }).navigation;
    function onNavigate(event: Event) {
      const navigationEvent = event as NavigateEventFields;
      if (navigationEvent.navigationType !== "traverse" || !event.cancelable) return;
      const key = navigationEvent.destination?.key;
      if (key !== undefined && key === replayingTraversalKey) {
        replayingTraversalKey = undefined;
        return;
      }
      intercept(event, () => {
        if (key === undefined || !navigationApi?.traverseTo) return;
        replayingTraversalKey = key;
        const traversal = navigationApi.traverseTo(key);
        traversal.committed.catch(ignoreRejection);
        traversal.finished.catch(ignoreRejection);
      });
    }

    function onDocumentClick(event: MouseEvent) {
      if (
        replayingClick ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) {
        return;
      }
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      ) {
        return;
      }
      intercept(event, () => {
        if (!link.isConnected) {
          window.location.assign(destination.href);
          return;
        }
        replayingClick = true;
        try {
          link.click();
        } finally {
          replayingClick = false;
        }
      });
    }

    navigationApi?.addEventListener("navigate", onNavigate);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      if (prompt === askToLeave) {
        prompt = null;
        openQuestion = null;
      }
      navigationApi?.removeEventListener("navigate", onNavigate);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [askToLeave]);
}
