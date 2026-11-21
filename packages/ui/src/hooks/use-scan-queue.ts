"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

export interface ScanQueue<Item> {
  /**
   * Queues `item` and starts working through the queue if it is idle.
   * Returns false when the item was dropped as a repeat read: its key
   * matches the item being processed or the last one still waiting.
   */
  enqueue: (item: Item) => boolean;
  /** An item is being processed or waiting. */
  busy: boolean;
}

/**
 * Processes scans one at a time, in the order they were read, without
 * losing any. A scan stream differs from a submit button (see
 * `useSingleFlight`, which drops every call made while one runs): a desk
 * librarian working through a stack can read a second, different book
 * before the first one's request returns, and that book must still be
 * handled. Only a repeat of the same code next to itself is dropped, the
 * double read a shaky scanner fires before React re-renders.
 *
 * The guard and the queue live in refs, set synchronously, so two reads
 * dispatched in the same tick are told apart before any re-render. Items
 * run strictly one after another, so each one sees what the previous one
 * saved. A processor that throws does not stall the queue; it is expected
 * to report its own failures.
 */
export function useScanQueue<Item>(
  process: (item: Item) => Promise<void>,
  keyOf: (item: Item) => string,
): ScanQueue<Item> {
  const queue = useRef<Item[]>([]);
  const inFlightKey = useRef<string | null>(null);
  const draining = useRef(false);
  const latest = useRef({ process, keyOf });
  const [busy, setBusy] = useState(false);

  // Synced before the next scan can be dispatched, so the queue always
  // runs the processor from the latest render.
  useLayoutEffect(() => {
    latest.current = { process, keyOf };
  });

  const drain = useCallback(async () => {
    draining.current = true;
    setBusy(true);
    try {
      for (let item = queue.current.shift(); item !== undefined; item = queue.current.shift()) {
        inFlightKey.current = latest.current.keyOf(item);
        try {
          await latest.current.process(item);
        } catch {
          // The processor reports its own failures; the next scan still runs.
        } finally {
          inFlightKey.current = null;
        }
      }
    } finally {
      draining.current = false;
      setBusy(false);
    }
  }, []);

  const enqueue = useCallback(
    (item: Item) => {
      const key = latest.current.keyOf(item);
      const lastWaiting = queue.current.at(-1);
      const lastKey =
        lastWaiting === undefined ? inFlightKey.current : latest.current.keyOf(lastWaiting);
      if (key === lastKey) return false;
      queue.current.push(item);
      if (!draining.current) void drain();
      return true;
    },
    [drain],
  );

  return { enqueue, busy };
}
