import { describe, expect, it } from "vitest";

import { navAccessFixture } from "../../lib/navigation-access.fixture";
import { visibleLibrarySettingsTabs } from "../library/library-settings-tabs";

import { buildSettingsHubSections, settingsPageContext } from "./settings-hub";

const translate = (key: string): string => key;
const grant =
  (...codes: string[]) =>
  (permission: string) =>
    codes.includes(permission);

function hrefs(codes: string[], query?: string): string[] {
  return buildSettingsHubSections({
    access: navAccessFixture(grant(...codes)),
    query,
    translate,
  }).flatMap((section) => section.cards.map((card) => card.href));
}

describe("buildSettingsHubSections", () => {
  it("shows only the reader's own account pages to a reader with no permissions", () => {
    expect(hrefs([])).toEqual([
      "/settings/security",
      "/settings/notifications",
      "/settings/appearance",
    ]);
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
    expect(all).toHaveLength(16);
  });

  it("gates a card on the permission of its registry entry", () => {
    expect(hrefs(["manage_workflows"])).toContain("/settings/workflows");
    expect(hrefs(["manage_workflows"])).not.toContain("/settings/whatsapp");
  });

  it("drops sections that end up empty", () => {
    const sections = buildSettingsHubSections({
      access: navAccessFixture(grant("manage_whatsapp")),
      translate,
    });
    expect(sections.map((section) => section.key)).toEqual(["communication", "account"]);
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

describe("settingsPageContext", () => {
  const admin = navAccessFixture(grant("manage_settings", "view_audit_logs", "view_roles"));

  it("names a page after its registry entry and tabs the pages of its hub section", () => {
    const context = settingsPageContext("settings-report-header", { access: admin, translate });
    expect(context?.section).toBe("identity");
    expect(context?.title).toBe("app.settings.reportHeader.navLabel");
    expect(context?.tabs.map((tab) => tab.href)).toEqual([
      "/settings/branding",
      "/settings/report-header",
      "/settings/document-templates",
    ]);
  });

  it("leaves pages of other areas out of the tabs", () => {
    const context = settingsPageContext("settings-session", { access: admin, translate });
    // Users and roles live in Data Sekolah's users area, not in these tabs.
    expect(context?.tabs.map((tab) => tab.href)).toEqual([
      "/settings/session",
      "/settings/sso",
      "/settings/audit-logs",
    ]);
  });

  it("only tabs the pages the reader may open", () => {
    const context = settingsPageContext("settings-audit", {
      access: navAccessFixture(grant("view_audit_logs")),
      translate,
    });
    expect(context?.tabs.map((tab) => tab.href)).toEqual(["/settings/audit-logs"]);
  });

  it("groups the reader's own account pages apart from the school's", () => {
    const context = settingsPageContext("settings-appearance", {
      access: navAccessFixture(grant()),
      translate,
    });
    expect(context?.section).toBe("account");
    expect(context?.tabs).toHaveLength(3);
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
