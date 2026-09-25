// Wire shapes for /ws/me (apps/api/cmd/api/ws.go's package doc comment is
// the source of truth). Two shapes travel on the same socket today:
//
//   - realtime.Envelope, `{"type","topic","at","payload"}` -- "hello",
//     "subscribed", "unsubscribed", "subscribe_rejected", and
//     "notification_created" all use this shape (docs/analysis/
//     realtime-plan-2026-09-25.md section 4.1).
//   - A handful of not-yet-migrated events (`classroom_entry_scanned`,
//     apps/api/internal/modules/permits/service/scantoken.go) still publish
//     their own flat JSON with a `type` field but no `topic`/`payload`
//     wrapper (plan section 1.5 #1) -- migrating those is chunk C1's job,
//     not this one's.
//
// RealtimeMessage below covers both: every message has `type`, and callers
// that know a particular type's extra fields read them straight off the
// parsed object rather than through a `payload` that may not exist.
export interface RealtimeMessage {
  readonly type: string;
  readonly topic?: string;
  readonly at?: string;
  readonly payload?: unknown;
  readonly [field: string]: unknown;
}

/** Parses one inbound text frame, or null for anything that is not a JSON
 * object with a string `type` -- readPump on the server already treats
 * unparseable frames as silently ignorable, so the client mirrors that
 * stance rather than throwing. */
export function parseRealtimeMessage(raw: string): RealtimeMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const type = (value as Record<string, unknown>).type;
  if (typeof type !== "string") return null;
  return value as RealtimeMessage;
}

/** Reads a string field off a RealtimeMessage's flat, non-`payload` shape
 * (e.g. classroom_entry_scanned's `student_name`), defaulting to "" for a
 * missing or malformed field rather than throwing -- the server is trusted,
 * but a defensive client never lets a wire-shape surprise crash a screen. */
export function stringField(message: RealtimeMessage, field: string): string {
  const value = message[field];
  return typeof value === "string" ? value : "";
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

/**
 * Exponential backoff with full jitter (`ceiling/2 + random(ceiling/2)`),
 * mirroring apps/web/features/notifications/realtime.ts's reconnectDelay:
 * many devices reconnecting after the same outage (a rolling deploy, a
 * shared Wi-Fi hiccup) do not all retry in lockstep. Unlike the web
 * version, callers here never stop calling this -- chunk F's contract is
 * "no silent give-up" -- so there is no MAX_RECONNECT_ATTEMPTS; the ceiling
 * itself is what keeps a long losing streak from waiting minutes between
 * tries.
 */
export function reconnectDelay(attempt: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}
