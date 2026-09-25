import type { LiveEnvelope } from "./types";

/**
 * Parses one `/ws/me` text frame into a LiveEnvelope. Handles both wire
 * shapes documented in docs/analysis/realtime-plan-2026-09-25.md section
 * 1.5 #1 and section 4.1: the `Envelope`
 * (apps/api/internal/platform/realtime/envelope.go) every message this
 * chunk's server side (hello, notification_created, subscribed,
 * unsubscribed, subscribe_rejected) already sends
 * (`{"type","topic","at","payload"}`), and the flat shape a publisher not
 * yet migrated to `Hub.PublishEvent` still sends -- today only
 * `permits/service/scantoken.go`'s `classroom_entry_scanned`
 * (`{"type", ...fields directly on the object, no "payload" wrapper}`).
 * A present `payload` key wins; an absent one falls back to the rest of
 * the object, so this keeps working unchanged once that publisher moves
 * to `PublishEvent` (chunk C1) -- the two shapes are indistinguishable to
 * a caller that only ever reads `type`/`payload`.
 *
 * Returns null for anything that is not a JSON object with a string
 * `type`, mirroring the server's own "ignore what does not parse" stance
 * for the reverse direction (readPump, client.go).
 */
export function parseLiveMessage(raw: string): LiveEnvelope | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  const { type, topic, at, payload, ...rest } = record;
  if (typeof type !== "string") return null;

  return {
    type,
    topic: typeof topic === "string" ? topic : undefined,
    at: typeof at === "string" ? at : undefined,
    payload: payload !== undefined ? payload : rest,
  };
}
