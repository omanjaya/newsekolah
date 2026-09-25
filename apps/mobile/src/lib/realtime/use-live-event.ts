// A thin sibling of useLiveInvalidate for the one case a query-key
// invalidation cannot cover: apps/api/internal/modules/permits/service/
// scantoken.go's classroom_entry_scanned still carries display fields
// straight on the message (student_name, class_name, ...) rather than an
// id to re-fetch -- it predates the Envelope convention (docs/analysis/
// realtime-plan-2026-09-25.md section 1.5 #1) and chunk C1 has not migrated
// it yet. useLiveInvalidate has nothing useful to invalidate for it; this
// hook hands the raw message to onEvent instead, for the one screen (the
// teacher's classroom-entry QR, components/screens/QrSheet.tsx) that reads
// it directly.
import { useEffect } from "react";
import type { RealtimeMessage } from "./envelope";
import { useLiveSocketConnection } from "./live-socket-provider";

export function useLiveEvent(
  eventTypes: readonly string[],
  onEvent: (message: RealtimeMessage) => void,
): void {
  const connection = useLiveSocketConnection();

  useEffect(() => connection.onEventTypes(eventTypes, onEvent), [connection, eventTypes, onEvent]);
}
