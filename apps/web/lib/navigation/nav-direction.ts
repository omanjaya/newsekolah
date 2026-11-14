import { matchesHref } from "./active-href";

/**
 * How a phone's page content enters after a navigation (globals.css):
 * - `forward`: deeper, to a child of the page (a detail route); from the right.
 * - `back`: up to a parent, or back through history; from the left.
 * - `tab`: across the bottom bar's destinations; a plain quick fade.
 * - `neutral`: anything else; the template's own fade and rise.
 */
export type NavDirection = "forward" | "back" | "tab" | "neutral";

/** A history traversal (the browser's back or forward), when the navigation was one. */
export type HistoryMove = "back" | "forward";

/** `inner` lies strictly below `outer` in the route tree. */
function isBelow(inner: string, outer: string): boolean {
  return inner !== outer && matchesHref(inner, outer);
}

/**
 * The direction of a move from `from` to `to`. The route tree decides
 * first (going to a child is forward, to an ancestor back, whatever the
 * history says), then a history traversal, then a jump onto one of the
 * bar's own destinations (`tabRoots`), which reads as switching tabs,
 * then a jump straight to a detail route (a page below the menu entry
 * that owns it, `ownerOf`: a session opened from the home), which goes
 * deeper. When none of these applies, the neutral entrance is the safe
 * answer.
 */
export function resolveNavDirection({
  from,
  to,
  history,
  tabRoots,
  ownerOf,
}: {
  from: string | undefined;
  to: string;
  history?: HistoryMove;
  tabRoots: readonly string[];
  /** The menu entry's href that owns a path (`activeNavHref`), if any. */
  ownerOf?: (path: string) => string | undefined;
}): NavDirection {
  if (from === undefined || from === to) return "neutral";
  if (isBelow(to, from)) return "forward";
  if (isBelow(from, to)) return "back";
  if (history) return history;
  if (tabRoots.includes(to)) return "tab";
  const owner = ownerOf?.(to)?.split("?")[0];
  if (owner !== undefined && isBelow(to, owner)) return "forward";
  return "neutral";
}

/**
 * The browser's own session history, as far as the app has seen it: each
 * push adds an entry after the current one, and a pop is matched against
 * the neighbouring entries to tell back from forward. A pop to anything
 * else (a reload in between, a replaced entry) is unknown.
 */
export class HistoryTrail {
  private entries: string[] = [];
  private index = -1;

  /** Records a navigation that was not a history traversal. */
  push(path: string): void {
    if (this.entries[this.index] === path) return;
    this.entries = [...this.entries.slice(0, this.index + 1), path];
    this.index = this.entries.length - 1;
  }

  /** Records a traversal to `path` and says which way it went, when that is known. */
  pop(path: string): HistoryMove | undefined {
    if (this.entries[this.index - 1] === path) {
      this.index -= 1;
      return "back";
    }
    if (this.entries[this.index + 1] === path) {
      this.index += 1;
      return "forward";
    }
    // Lost track: start over from here.
    this.entries = [path];
    this.index = 0;
    return undefined;
  }
}
