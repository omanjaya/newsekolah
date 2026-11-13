import { describe, expect, it } from "vitest";

import { offeredWebhookEvents, webhookEventModule } from "./webhook-event-modules";

const CATALOG = [
  "attendance.submitted",
  "substitution.requested",
  "leave_request.submitted",
  "exit_permit.issued",
  "late_arrival.opened",
  "warning_letter.issued",
  "announcement.published",
];

const off =
  (...modules: string[]) =>
  (module: string) =>
    !modules.includes(module);

describe("offeredWebhookEvents", () => {
  it("offers the whole catalog while every module is on", () => {
    expect(offeredWebhookEvents(CATALOG, off())).toEqual(CATALOG);
  });

  it("leaves out the events of switched-off modules only", () => {
    expect(offeredWebhookEvents(CATALOG, off("permits", "discipline", "announcements"))).toEqual([
      "attendance.submitted",
      "substitution.requested",
    ]);
  });

  it("maps each event to the module that publishes it", () => {
    expect(webhookEventModule("leave_request.issued")).toBe("permits");
    expect(webhookEventModule("warning_letter.issued")).toBe("discipline");
    expect(webhookEventModule("announcement.published")).toBe("announcements");
    expect(webhookEventModule("attendance.submitted")).toBeUndefined();
  });
});
