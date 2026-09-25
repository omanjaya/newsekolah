"use client";

import { useEffect } from "react";

import { useLiveSocketContext } from "./live-socket-provider";

/**
 * Ref-counted interest in one realtime topic, in the short client -> server
 * form `apps/api/cmd/api/ws.go`'s wire contract expects: `"role:<slug>"`
 * or `"duty:<slug>[:<classID>]"` (never tenant-qualified -- the server
 * always resolves under the connection's own tenant). Multiple components
 * mounted at once asking for the same topic only ever produce one
 * subscribe message on the wire and one unsubscribe once the last of them
 * unmounts; LiveSocketProvider owns the actual counting and re-sends every
 * held topic on every reconnect (its per-connection grant does not survive
 * one).
 *
 * This hook only ever declares interest -- it does not dispatch anything
 * itself. Pair it with useLiveInvalidate for the event types that topic's
 * events carry.
 *
 * `topic` may be undefined (or an empty string) for a component that only
 * sometimes has a topic to ask for (e.g. a homeroom-scoped duty topic
 * before the class id is known); no subscribe message is sent while it is
 * falsy.
 */
export function useLiveTopic(topic: string | undefined): void {
  const { subscribeTopic } = useLiveSocketContext();

  useEffect(() => {
    if (!topic) return;
    return subscribeTopic(topic);
  }, [subscribeTopic, topic]);
}
