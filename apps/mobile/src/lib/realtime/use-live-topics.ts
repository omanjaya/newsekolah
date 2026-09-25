// Same as use-live-topic.ts's useLiveTopic, but for a variable-length list
// of topics -- e.g. one duty:homeroom:<classID> per class a homeroom
// teacher covers, which varies per account and cannot be expressed as a
// fixed number of useLiveTopic calls (React's rules of hooks forbid a
// variable-length list of hook calls). Falsy entries are dropped before
// subscribing. Built on the same ref-counted RealtimeConnection.subscribeTopic
// useLiveTopic uses, so mixing both for different topics on one screen is
// safe. Mirrors apps/web/lib/realtime/use-live-topic.ts's useLiveTopics.
import { useEffect } from "react";
import { useLiveSocketConnection } from "./live-socket-provider";

export function useLiveTopics(topics: readonly (string | undefined)[]): void {
  const connection = useLiveSocketConnection();
  const key = topics.filter((topic): topic is string => Boolean(topic)).join(",");

  useEffect(() => {
    if (!key) return;
    const unsubscribes = key.split(",").map((topic) => connection.subscribeTopic(topic));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [connection, key]);
}
