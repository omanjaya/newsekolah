"use client";

import { useTranslations } from "next-intl";

/**
 * Entity types the API writes to the audit log (apps/api `audit.Record`
 * call sites). The filter offers exactly these, so an admin picks from a
 * list instead of guessing the raw code.
 */
export const AUDIT_ENTITY_TYPES = [
  "user",
  "role",
  "duty_type",
  "duty_assignment",
  "webauthn_credential",
  "sso_google_config",
  "tenant",
  "visitor_incident",
] as const;

export interface AuditLabels {
  action: (code: string) => string;
  entityType: (code: string) => string;
}

/**
 * Human labels for audit action and entity codes. A code the catalog does
 * not know yet (a module added after this list) falls back to the raw code
 * rather than an empty cell.
 */
export function useAuditLabels(): AuditLabels {
  const t = useTranslations("app.audit");
  return {
    action: (code) => {
      const key = `actions.${code}`;
      return t.has(key) ? t(key) : code;
    },
    entityType: (code) => {
      const key = `entityTypes.${code}`;
      return t.has(key) ? t(key) : code;
    },
  };
}

/**
 * Last eight hex digits of a UUID: enough to tell two rows apart, short
 * enough for a phone. The tail, not the head, because a UUIDv7 starts with
 * a timestamp that rows written close together share.
 */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(-8) : id;
}
