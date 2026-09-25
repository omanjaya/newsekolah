// Same shape as apps/web/lib/realtime's useLiveTopic (plan section 3.2/3.3):
// subscribes the shared /ws/me connection to one short topic
// ("role:librarian", "duty:homeroom:<classID>") for as long as the calling
// component stays mounted. Ref-counted at the connection level
// (connection.ts's subscribeTopic), so two screens wanting the same topic
// at once share one server-side grant, and it drops to zero -- releasing
// the topic -- only once every caller has unmounted.
import { useEffect } from "react";
import { useLiveSocketConnection } from "./live-socket-provider";

/** Subscribes to topic (the short, tenant-less form the server resolves
 * under the caller's own tenant -- see subscribe.go's parseTopic) while
 * mounted. topic should be a stable string across renders, or a value
 * derived with useMemo, so it does not resubscribe every render. */
export function useLiveTopic(topic: string): void {
  const connection = useLiveSocketConnection();

  useEffect(() => connection.subscribeTopic(topic), [connection, topic]);
}
