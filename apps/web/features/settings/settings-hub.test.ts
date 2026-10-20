import { describe, expect, it } from "vitest";

import { visibleLibrarySettingsTabs } from "../library/library-settings-tabs";

import { buildSettingsHubSections } from "./settings-hub";

const translate = (key: string): string => key;
const grant =
  (...codes: string[]) =>
  (permission: string) =>
    codes.includes(permission);

function hrefs(codes: string[], query?: string): string[] {
  return buildSettingsHubSections({ can: grant(...codes), query, translate }).flatMap((section) =>
    section.cards.map((card) => card.href),
  );
}

describe("buildSettingsHubSections", () => {
  it("shows only ungated cards to a reader with no permissions", () => {
    expect(hrefs([])).toEqual(["/settings/security"]);
  });

  it("shows everything for a full settings administrator", () => {
    const all = hrefs([
      "manage_settings",
      "view_users",
      "view_roles",
      "view_audit_logs",
      "manage_notification_settings",
      "manage_whatsapp",
      "view_integrations",
      "manage_workflows",
    ]);
    expect(all).toContain("/settings/branding");
    expect(all).toContain("/school/users");
    expect(all).toContain("/settings/audit-logs");
    expect(all).toContain("/settings/workflows");
    expect(all).toContain("/setup");
    expect(all).toHaveLength(14);
  });

  it("gates a card on the permission of its registry entry", () => {
    expect(hrefs(["manage_workflows"])).toContain("/settings/workflows");
    expect(hrefs(["manage_workflows"])).not.toContain("/settings/whatsapp");
  });

  it("drops sections that end up empty", () => {
    const sections = buildSettingsHubSections({ can: grant("manage_whatsapp"), translate });
    expect(sections.map((section) => section.key)).toEqual(["access", "communication"]);
  });

  it("filters by label or description, case-insensitively", () => {
    const can = ["manage_settings", "manage_whatsapp"];
    expect(hrefs(can, "WHATSAPP")).toEqual(["/settings/whatsapp"]);
    expect(hrefs(can, "app.settingsHub.cards.branding")).toEqual(["/settings/branding"]);
    expect(hrefs(can, "no-such-card")).toEqual([]);
  });

  it("never lets search reveal a card the reader may not open", () => {
    expect(hrefs([], "audit")).toEqual([]);
  });
});

describe("visibleLibrarySettingsTabs", () => {
  it("returns no tabs without permissions", () => {
    expect(visibleLibrarySettingsTabs(grant())).toEqual([]);
  });

  it("gates loan rules and member types on manage_library_settings", () => {
    expect(visibleLibrarySettingsTabs(grant("manage_library_settings"))).toEqual([
      "loanRules",
      "memberTypes",
    ]);
  });

  it("gates library data on view_library", () => {
    expect(visibleLibrarySettingsTabs(grant("view_library"))).toEqual(["masterData"]);
  });
});
