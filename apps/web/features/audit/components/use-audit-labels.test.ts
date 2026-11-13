import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import en from "../../../messages/features/audit.en.json";
import id from "../../../messages/features/audit.id.json";

import { AUDIT_ENTITY_TYPES, humanizeAuditCode } from "./use-audit-labels";

// Codes written by apps/api `audit.Record` call sites across modules, found by
// scanning the Go sources so a new action without a label fails this test.
const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../api");
const RECORD_CALL = /\baudit\.Record\([^\n]*?"([a-z_]+\.[a-z_]+)"/g;

function scanApiActions(dir: string, out: Set<string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scanApiActions(path, out);
    else if (entry.name.endsWith(".go") && !entry.name.endsWith("_test.go")) {
      for (const match of readFileSync(path, "utf8").matchAll(RECORD_CALL)) {
        if (match[1]) out.add(match[1]);
      }
    }
  }
}

const scanned = new Set<string>();
if (existsSync(API_ROOT)) scanApiActions(join(API_ROOT, "internal"), scanned);

// Actions the scan cannot see (recorded through a variable).
const API_ACTIONS = [
  ...new Set([
    ...scanned,
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
    "role_testing.start",
    "role_testing.switch",
    "role_testing.stop",
    "role_testing.logout",
  ]),
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

describe("api scan", () => {
  it("finds the audit action codes in the API sources", () => {
    expect(scanned.size).toBeGreaterThan(10);
  });
});

describe("humanizeAuditCode", () => {
  it("spaces out dotted and underscored codes", () => {
    expect(humanizeAuditCode("feature_flag.update")).toBe("feature flag update");
  });
});
