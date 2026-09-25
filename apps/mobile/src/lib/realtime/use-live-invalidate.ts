// Same shape as apps/web/lib/realtime's useLiveInvalidate (plan section
// 3.3) so a screen shared in spirit between web and mobile reads alike:
// pass the event types a screen cares about and the query keys a fresh
// value for them should invalidate. eventTypes and queryKeys should be
// stable references (module-level constants, e.g. from a feature's
// keys.ts) -- like the web hook, this only re-subscribes when the
// reference changes, not on every render.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveSocketConnection } from "./live-socket-provider";

/**
 * Invalidates queryKeys whenever a message of one of eventTypes arrives on
 * the shared /ws/me connection, and again on every resync (every "hello"
 * after the first -- a reconnect after a drop, backgrounding, or a token
 * refresh, plan section 3.4): the query keys a screen registers here are
 * exactly the ones re-invalidated together, so an event missed while the
 * socket was down is never silently lost.
 */
export function useLiveInvalidate(
  eventTypes: readonly string[],
  queryKeys: readonly (readonly unknown[])[],
): void {
  const queryClient = useQueryClient();
  const connection = useLiveSocketConnection();

  useEffect(() => {
    const invalidate = () => {
      for (const key of queryKeys) void queryClient.invalidateQueries({ queryKey: key });
    };
    const unsubscribeEvents = connection.onEventTypes(eventTypes, invalidate);
    const unsubscribeResync = connection.onResync(invalidate);
    return () => {
      unsubscribeEvents();
      unsubscribeResync();
    };
  }, [connection, queryClient, eventTypes, queryKeys]);
}
