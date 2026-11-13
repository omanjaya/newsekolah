import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS, NOTIFICATION_KIND_MODULE, availableNotificationKinds } from "./api";

const off =
  (...modules: string[]) =>
  (module: string) =>
    !modules.includes(module);

describe("availableNotificationKinds", () => {
  it("lists every kind while every module is on", () => {
    expect(availableNotificationKinds(off())).toEqual([...NOTIFICATION_KINDS]);
  });

  it("leaves out the permits kinds while permits is off", () => {
    expect(availableNotificationKinds(off("permits"))).toEqual([
      "announcement_published",
      "attendance_submitted",
      "substitution_requested",
      "substitution_responded",
    ]);
  });

  it("leaves out the announcement kind while announcements is off", () => {
    expect(availableNotificationKinds(off("announcements"))).not.toContain(
      "announcement_published",
    );
  });

  it("names the emitting module of every permits and announcements kind", () => {
    const owned = Object.entries(NOTIFICATION_KIND_MODULE).filter(([, module]) => module);
    expect(
      owned.every(([kind, module]) =>
        kind === "announcement_published" ? module === "announcements" : module === "permits",
      ),
    ).toBe(true);
    expect(owned).toHaveLength(9);
  });
});
