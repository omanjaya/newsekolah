/** Whether this task (the click or key press being handled) already added a history entry. */
let pushedThisTask = false;

/**
 * Writes a filter change to the address bar without navigating the route.
 *
 * Every write made while one task runs is one history entry: the first
 * `push` adds the entry and the writes after it replace that entry, until
 * the task's microtasks run. One action that changes several URL filters
 * ("Hapus semua filter" clears each pill in turn, a page's reset sets each
 * of its filters) is then one Back step, never a walk through
 * half-cleared states the reader never chose. Separate actions are
 * separate tasks, so each keeps its own entry.
 */
export function writeUrlHistory(href: string, mode: "push" | "replace"): void {
  // A string, not a URL object: Serwist's navigation cache (off in
  // next.config.ts) wraps the history API and posts this argument to a
  // Worker, which cannot clone a URL; a string keeps every write safe if it
  // is ever switched back on.
  if (mode === "replace" || pushedThisTask) {
    window.history.replaceState(null, "", href);
    return;
  }
  window.history.pushState(null, "", href);
  pushedThisTask = true;
  queueMicrotask(() => {
    pushedThisTask = false;
  });
}
