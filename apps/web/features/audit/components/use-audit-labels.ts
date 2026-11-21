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
  "visitor_visit",
  "payment",
  "violation_record",
  "warning_letter",
  "leave_request",
  "document",
  "counseling",
  "report_publication",
  "assessment_component",
  "feature_flag",
  "operator_alert_settings",
  "announcement",
  "webhook_endpoint",
  "api_key",
  "fee_type",
  "discount",
  "bill",
  "document_template",
  "report_schedule",
  "session",
  "substitution_request",
] as const;

export interface AuditLabels {
  action: (code: string) => string;
  entityType: (code: string) => string;
}

/** `feature_flag.update` becomes `feature flag update`: readable when the catalog has no entry yet. */
export function humanizeAuditCode(code: string): string {
  return code.replace(/[._]+/g, " ").trim();
}

/**
 * Human labels for audit action and entity codes. A code the catalog does
 * not know yet (a module added after this list) falls back to a spaced-out
 * version of the code rather than an empty cell or a dotted identifier.
 */
export function useAuditLabels(): AuditLabels {
  const t = useTranslations("app.audit");
  return {
    action: (code) => {
      const key = `actions.${code}`;
      return t.has(key) ? t(key) : humanizeAuditCode(code);
    },
    entityType: (code) => {
      const key = `entityTypes.${code}`;
      return t.has(key) ? t(key) : humanizeAuditCode(code);
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
