/**
 * QR payloads carry the instance id alongside the token so a scanner can
 * act on a permit it has never seen. Same format as apps/web:
 * "sion:<kind>:<instanceId>:<token>". A bare token (no prefix) is accepted
 * for codes typed by hand.
 */
export type ScanKind =
  "classroom_entry" | "late_arrival" | "approve" | "gate" | "approve_stage" | "gate_exit";

export interface ScanPayload {
  kind?: string;
  instanceId?: string;
  token: string;
}

export function encodeScanPayload(kind: string, instanceId: string, token: string): string {
  return `sion:${kind}:${instanceId}:${token}`;
}

export function decodeScanPayload(raw: string): ScanPayload {
  const value = raw.trim();
  if (value.startsWith("sion:")) {
    const [, kind, instanceId, token] = value.split(":");
    if (token) return { kind, instanceId, token };
  }
  return { token: value };
}
