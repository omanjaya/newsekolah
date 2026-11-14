/**
 * A ResizeObserver over a set of elements that changes over time: `track`
 * observes the elements not yet observed and lets go of the ones no longer
 * listed, so a hook can hand it "the elements that matter now" after every
 * DOM change without piling up observations. A no-op where ResizeObserver
 * does not exist (jsdom, the server).
 */
export interface ResizeTracker {
  track: (elements: Iterable<Element>) => void;
  disconnect: () => void;
}

export function createResizeTracker(onResize: () => void): ResizeTracker {
  if (typeof ResizeObserver === "undefined") {
    return { track: () => undefined, disconnect: () => undefined };
  }
  const observer = new ResizeObserver(onResize);
  let observed = new Set<Element>();
  return {
    track: (elements) => {
      const next = new Set(elements);
      for (const element of observed) {
        if (!next.has(element)) observer.unobserve(element);
      }
      for (const element of next) {
        if (!observed.has(element)) observer.observe(element);
      }
      observed = next;
    },
    disconnect: () => {
      observer.disconnect();
      observed = new Set();
    },
  };
}
