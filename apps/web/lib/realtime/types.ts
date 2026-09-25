/**
 * Wire types shared with the server contract documented in
 * apps/api/cmd/api/ws.go's package doc comment and
 * docs/analysis/realtime-plan-2026-09-25.md section 4.1. Kept in one file
 * so every consumer (LiveSocketProvider, useLiveInvalidate,
 * useNotificationsSocket) names the same event types instead of each
 * spelling its own string literals.
 */

/**
 * Event names this client already knows about, kept as a literal union
 * for autocomplete while `(string & {})` still accepts any future event
 * name the server contract adds (chunk C1-C4's domain events) without a
 * type error here blocking on a client release.
 */
export type LiveEventType =
  | "hello"
  | "notification_created"
  | "classroom_entry_scanned"
  | "subscribed"
  | "unsubscribed"
  | "subscribe_rejected"
  | (string & {});

/**
 * One /ws/me message, normalized (see envelope.ts's parseLiveMessage) to
 * always carry `payload` regardless of which wire shape the publisher
 * used -- the Envelope apps/api/internal/platform/realtime/envelope.go
 * sends today, or the flat shape a not-yet-migrated publisher
 * (permits/service/scantoken.go's classroom_entry_scanned) still sends.
 */
export interface LiveEnvelope<TPayload = unknown> {
  type: LiveEventType;
  topic?: string;
  at?: string;
  payload?: TPayload;
}

/**
 * LiveSocketProvider's connection state, exposed for the header's
 * ConnectionStatusIndicator:
 * - "idle": no signed-in user yet, nothing to connect.
 * - "connecting": attempting the handshake, never yet reached "open"
 *   since the last reset.
 * - "open": hello received, connection healthy.
 * - "reconnecting": was open (or failed to open) and is retrying.
 * - "paused": deliberately closed because the tab has been hidden for a
 *   while -- not shown as trouble, resumes the moment the tab is visible
 *   again.
 */
export type LiveSocketStatus = "idle" | "connecting" | "open" | "reconnecting" | "paused";
