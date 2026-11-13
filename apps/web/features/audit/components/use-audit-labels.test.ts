import { describe, expect, it } from "vitest";

import en from "../../../messages/features/audit.en.json";
import id from "../../../messages/features/audit.id.json";

import { AUDIT_ENTITY_TYPES, humanizeAuditCode } from "./use-audit-labels";

// Codes written by apps/api `audit.Record` call sites across modules.
const API_ACTIONS = [
  "counseling.create",
  "counseling.update",
  "counseling.read",
  "document.issue",
  "feature_flag.update",
  "grading.report_publish",
  "grading.score_save",
  "operator_alerts.update",
  "payment.record",
  "payment.void",
  "violation.void",
  "role.replace_permissions",
  "user.import_update",
];

function lookup(catalog: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (cursor, key) =>
        typeof cursor === "object" && cursor !== null
          ? (cursor as Record<string, unknown>)[key]
          : undefined,
      catalog,
    );
}

describe.each([
  ["id", id],
  ["en", en],
])("audit catalog (%s)", (_locale, catalog) => {
  it("labels every known action code", () => {
    for (const code of API_ACTIONS) {
      expect(typeof lookup(catalog.actions, code), code).toBe("string");
    }
  });

  it("labels every entity type offered by the filter", () => {
    for (const type of AUDIT_ENTITY_TYPES) {
      expect(typeof (catalog.entityTypes as Record<string, string>)[type], type).toBe("string");
    }
  });
});

describe("humanizeAuditCode", () => {
  it("spaces out dotted and underscored codes", () => {
    expect(humanizeAuditCode("feature_flag.update")).toBe("feature flag update");
  });
});
